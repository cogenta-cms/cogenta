import { CogentaError } from '@cogenta/core'
import type {
  BlockZones,
  CollectionDefinition,
  ContentEntry,
  ContentStatus,
  ContentStore,
  ContentValues,
  EntryState,
  ListOptions,
  Page,
  Provenance,
  SortField,
  SortOrder,
} from '@cogenta/schema'
import { isSystemFieldName } from '@cogenta/schema'
import {
  cursorFor,
  entryState,
  grantedEntryId,
  matchesFilter,
  roleState,
  scanPages,
} from '../content/index.js'
import type {
  AccessContext,
  FieldCondition,
  Filter,
  PermissionLayer,
  QueryRequest,
} from '../types.js'
import { queryInvalid } from './errors.js'

/**
 * GraphQL's composition of the shared content layer.
 *
 * The L1 spec is blunt: "REST and GraphQL expose the same thing and share the
 * same permission and serialisation layer. There are not two implementations."
 * The draft guard, the preview scope, the filter and the keyset walk therefore
 * come from `src/content/`; this file is a transport. It decides nothing about
 * who may read what.
 *
 * What is GraphQL's own is that it stays **lazy**. It returns `ContentEntry`
 * rows, not a serialised document with its relations already expanded, because a
 * GraphQL document says which fields it wants and a relation is resolved only if
 * it was asked for — through the dataloader, so twenty parents cost one read.
 * Eager expansion here would make field selection and batching meaningless.
 *
 * Two invariants live here, and nowhere else:
 *
 * 1. **The state an actor reads is derived from the permission layer, never
 *    from the request.** There is no `state:` or `draft:` argument anywhere in
 *    the GraphQL schema, so no query — however written, however nested — can
 *    ask for the working copy. `public` gets `state: 'published'`, and the
 *    store then only ever returns rows whose status is `published`.
 * 2. **A user filter is never pushed into `ListOptions.status`.** That option
 *    replaces the published-only predicate; letting `filter: { status: { eq:
 *    "draft" } }` reach it would undo invariant 1 in one line.
 */

export interface ContentGateway {
  collections(): readonly CollectionDefinition[]
  collection(name: string): CollectionDefinition
  read(name: string, id: string, context: AccessContext): Promise<ContentEntry | null>
  /** Batched by the dataloader. Never called once per parent by a resolver. */
  readMany(
    name: string,
    ids: readonly string[],
    context: AccessContext,
  ): Promise<ReadonlyMap<string, ContentEntry>>
  list(request: QueryRequest, context: AccessContext): Promise<Page<ContentEntry>>
  create(name: string, input: MutationInput, context: AccessContext): Promise<ContentEntry>
  update(
    name: string,
    id: string,
    input: MutationInput,
    context: AccessContext,
  ): Promise<ContentEntry>
  remove(name: string, id: string, context: AccessContext): Promise<boolean>
  publish(name: string, id: string, context: AccessContext): Promise<ContentEntry>
  restore(name: string, id: string, version: number, context: AccessContext): Promise<ContentEntry>
}

export interface MutationInput {
  readonly values?: Readonly<Record<string, unknown>>
  readonly blocks?: BlockZones
  readonly locale?: string
  readonly status?: ContentStatus
  readonly translationOf?: string | null
  readonly provenance?: Provenance
}

export interface ContentGatewayOptions {
  readonly collections: readonly CollectionDefinition[]
  /** One store per collection, keyed by collection name. */
  readonly stores: ReadonlyMap<string, ContentStore>
  readonly permissions: PermissionLayer
  /** Rows read per underlying page while a filter is being applied. */
  readonly scanSize?: number
}

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
/** Bounds the work one filtered query may cause when almost nothing matches. */
const MAX_SCANS = 20
const DEFAULT_SCAN_SIZE = 100

const SORT_FIELDS: Readonly<Record<string, SortField>> = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
}

export function createContentGateway(options: ContentGatewayOptions): ContentGateway {
  const { permissions, stores } = options
  const byName = new Map(options.collections.map((entry) => [entry.name, entry]))
  const scanSize = Math.max(options.scanSize ?? DEFAULT_SCAN_SIZE, 1)

  function definitionOf(name: string): CollectionDefinition {
    const found = byName.get(name)
    if (found === undefined) {
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: `There is no "${name}" collection.`,
        hint: 'Query one of the collections the generated schema declares.',
      })
    }
    return found
  }

  function storeOf(name: string): ContentStore {
    const found = stores.get(name)
    if (found === undefined) {
      throw new CogentaError({
        code: 'INTERNAL',
        message: `The "${name}" collection has no store.`,
        hint: 'Pass one store per collection when building the gateway.',
      })
    }
    return found
  }

  /**
   * Which face of the content this actor is entitled to, everywhere.
   *
   * The read permission is asserted here rather than inside the shared guard
   * because "you may not read this collection at all" is GraphQL's own error to
   * raise; `roleState` then answers the draft half of the question, from the
   * roles alone. Every read path funnels through it, so "the public role never
   * reaches a draft" is a property of one function rather than a condition every
   * resolver has to remember.
   */
  function stateFor(collection: CollectionDefinition, context: AccessContext): EntryState {
    permissions.assert('read', collection, context)
    return roleState(permissions, collection, context)
  }

  /**
   * The same question for one entry, where a grant does count — for that entry
   * and no other.
   *
   * Every path that returns entries goes through here, the batched relation
   * loader included; a loader that skipped it is precisely how a one-entry grant
   * becomes a collection-wide leak.
   */
  function stateForEntry(
    collection: CollectionDefinition,
    id: string,
    context: AccessContext,
  ): EntryState {
    permissions.assert('read', collection, context)
    return entryState(permissions, collection, context, id)
  }

  async function list(request: QueryRequest, context: AccessContext): Promise<Page<ContentEntry>> {
    const collection = definitionOf(request.collection)
    const state = stateFor(collection, context)
    const store = storeOf(collection.name)

    const limit = boundedLimit(request.limit)
    const sort = sortOf(collection, request.sort)
    const filter = request.filter
    const pushed = pushdown(collection, filter)

    const scan = await scanPages<ContentEntry>({
      limit,
      accept: (entry) => filter === undefined || matchesFilter(filter, entry),
      startCursor: request.after,
      maxFetches: MAX_SCANS,
      fetch: (cursor) => {
        const listOptions: ListOptions = {
          state,
          sort,
          limit: scanSize,
          ...(request.locale === undefined ? {} : { locale: request.locale }),
          ...(cursor === undefined ? {} : { cursor }),
          ...(Object.keys(pushed).length === 0 ? {} : { where: pushed }),
        }
        return store.list(listOptions)
      },
    })

    const overflowed = scan.overflowed
    const paged = scan.items
    let items: readonly ContentEntry[] = paged

    /*
     * The preview overlay.
     *
     * When `state` is `published` the loop above physically cannot have read a
     * draft, which is what makes the public rule airtight. A grant still has to
     * show its one entry, so it is fetched **by its id** and merged: the query
     * that produced the page was never widened, so entry B cannot appear no
     * matter how the filter, the sort or the cursor were written.
     *
     * It is pinned to the first page. A preview link is opened on a page the
     * editor is looking at, and inventing a position for a draft inside a
     * keyset ordering would either break the cursor or hide a published entry.
     */
    if (state === 'published') {
      const grantedId = grantedEntryId(permissions, collection, context)
      if (grantedId !== undefined) {
        const previewed = await store.read(grantedId, { state: 'working' })
        if (previewed !== null && (filter === undefined || matchesFilter(filter, previewed))) {
          const at = items.findIndex((entry) => entry.id === grantedId)
          if (at >= 0) items = items.map((entry, index) => (index === at ? previewed : entry))
          // Prepended without dropping anything: the page may hold one entry
          // more than asked for during a preview, which is a great deal less
          // surprising than a published entry silently falling off the end.
          else if (request.after === undefined) items = [previewed, ...items]
        }
      }
    }

    // Always the last *published* row of the page: a draft pinned by a preview
    // token has no place in the ordering and must never become a cursor.
    const last = paged.at(-1)

    return {
      items,
      hasMore: overflowed,
      // The cursor of the last entry actually handed out, not of the last row
      // scanned: the rows a filter rejected must not be skipped for a reader
      // whose next page uses a different filter.
      nextCursor: overflowed && last !== undefined ? cursorFor(last, sort) : null,
    }
  }

  return {
    collections: () => options.collections,
    collection: definitionOf,

    read: async (name, id, context) => {
      const collection = definitionOf(name)
      return storeOf(name).read(id, { state: stateForEntry(collection, id, context) })
    },

    readMany: async (name, ids, context) => {
      const collection = definitionOf(name)
      const found = new Map<string, ContentEntry>()
      const store = storeOf(name)

      // De-duplicated: twenty articles by three authors is three reads, which
      // is the N+1 the spec asks to prevent. The loop itself is the store's
      // current ceiling — `ContentStore` has no `read` by id set — and it is
      // deliberately the only place that would have to change when it grows
      // one: every caller batches through here already.
      for (const id of new Set(ids)) {
        const entry = await store.read(id, { state: stateForEntry(collection, id, context) })
        if (entry !== null) found.set(id, entry)
      }
      return found
    },

    list,

    create: async (name, input, context) => {
      const collection = definitionOf(name)
      permissions.assert('create', collection, context)
      // A caller that does not hold `publish` cannot create something already
      // public by passing `status: PUBLISHED` on the way in.
      const status = input.status ?? 'draft'
      if (status === 'published') permissions.assert('publish', collection, context)

      return storeOf(name).create({
        values: input.values ?? {},
        status,
        ...(input.blocks === undefined ? {} : { blocks: input.blocks }),
        ...(input.locale === undefined ? {} : { locale: input.locale }),
        ...(input.translationOf === undefined ? {} : { translationOf: input.translationOf }),
        ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
        ...(context.actor.id === null ? {} : { createdBy: context.actor.id }),
      })
    },

    update: async (name, id, input, context) => {
      const collection = definitionOf(name)
      permissions.assert('update', collection, context)
      return storeOf(name).update(id, {
        ...(input.values === undefined ? {} : { values: input.values }),
        ...(input.blocks === undefined ? {} : { blocks: input.blocks }),
        ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
        ...(context.actor.id === null ? {} : { updatedBy: context.actor.id }),
      })
    },

    remove: async (name, id, context) => {
      permissions.assert('delete', definitionOf(name), context)
      return storeOf(name).delete(id)
    },

    publish: async (name, id, context) => {
      permissions.assert('publish', definitionOf(name), context)
      return storeOf(name).publish(id, {
        ...(context.actor.id === null ? {} : { publishedBy: context.actor.id }),
      })
    },

    restore: async (name, id, version, context) => {
      permissions.assert('update', definitionOf(name), context)
      return storeOf(name).restore(id, version, {
        ...(context.actor.id === null ? {} : { updatedBy: context.actor.id }),
      })
    },
  }
}

function boundedLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_LIMIT
  if (!Number.isInteger(requested) || requested < 1) {
    throw queryInvalid(
      'A page size must be a positive whole number.',
      `Ask for between 1 and ${MAX_LIMIT} entries.`,
    )
  }
  return Math.min(requested, MAX_LIMIT)
}

function sortOf(collection: CollectionDefinition, requested: QueryRequest['sort']): SortOrder {
  const first = requested?.[0]
  if (first === undefined) return { field: 'id', direction: 'desc' }

  const field = SORT_FIELDS[first.field]
  if (field === undefined) {
    throw queryInvalid(
      `"${collection.name}" cannot be ordered by that field.`,
      'Order by id, createdAt or updatedAt: a cursor is only total on a column that is never null.',
    )
  }
  return { field, direction: first.direction }
}

/**
 * The part of a filter the database can answer.
 *
 * Only top-level equality on a declared, column-backed field: that is the whole
 * of `ListOptions.where`. Everything else is answered in memory by the shared
 * `matchesFilter`, which is why the pushdown may narrow the scan but must never
 * be the only thing consulted. An `or` pushes nothing down — a disjunction is
 * not a conjunction of predicates, and pushing one branch would silently drop
 * rows.
 *
 * It stays here rather than in `src/content/`: it is a *store* optimisation, and
 * REST has no second implementation of it to unify with. A shared helper with
 * one caller is an abstraction for a hypothetical case.
 */
function pushdown(
  collection: CollectionDefinition,
  filter: Filter | undefined,
): Record<string, unknown> {
  const pushed: Record<string, unknown> = {}
  if (filter === undefined) return pushed

  const conditions = 'and' in filter ? filter.and : 'or' in filter ? [] : [filter]

  for (const condition of conditions) {
    if (!isFieldCondition(condition)) continue
    if (condition.operator !== 'eq') continue
    // System columns are excluded on purpose: `status` in particular is the one
    // `ListOptions` field that would override the published-only predicate.
    if (isSystemFieldName(condition.field)) continue

    const definition = collection.fields[condition.field]
    if (definition === undefined) continue
    if (definition.kind === 'blocks') continue
    if (definition.kind === 'relation' && definition.options['many'] === true) continue
    if (definition.kind === 'media' && definition.options['many'] === true) continue
    if (definition.kind === 'select' && definition.options['many'] === true) continue

    pushed[condition.field] = condition.value
  }

  return pushed
}

function isFieldCondition(filter: Filter): filter is FieldCondition {
  return 'field' in filter
}
