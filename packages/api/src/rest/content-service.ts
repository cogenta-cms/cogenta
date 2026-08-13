import { CogentaError } from '@cogenta/core'
import type {
  CollectionDefinition,
  ContentDiff,
  ContentEntry,
  ContentStore,
  CreateInput,
  EntryState,
  SortOrder,
  UpdateInput,
  VersionSummary,
} from '@cogenta/schema'
import { encodeCursor } from '@cogenta/schema'
import { hasRoleDraftAccess, previewCovers } from '../access/index.js'
import type { AccessContext, PermissionLayer } from '../types.js'
import { matchesFilter } from './filter.js'
import { DEFAULT_LIMITS, type ListQuery, type QueryLimits } from './query.js'
import { type ExpansionSource, type SerialisedEntry, serialiseEntry } from './serialise.js'

/**
 * The shared content service.
 *
 * The L1 spec is blunt about this: "REST and GraphQL expose the same thing and
 * share the same permission and serialisation layer. There are not two
 * implementations." Everything a transport could get wrong lives here — the
 * permission check, the draft rule, the cursor, the filter, the depth bound —
 * so a transport is left with parsing and status codes.
 *
 * It sits under `rest/` only because REST is being written first. Nothing in it
 * mentions HTTP, and the note in the task report says where it should move.
 */

export interface ContentServiceOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly permissions: PermissionLayer
  /** How to reach the persistence layer for a collection. */
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  readonly limits?: Partial<QueryLimits>
}

export interface ContentPage {
  readonly items: readonly SerialisedEntry[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface ReadOptions {
  readonly state: EntryState
  readonly depth: number
}

export interface ContentService {
  readonly limits: QueryLimits
  /** Throws `CONTENT_NOT_FOUND` when the schema declares no such collection. */
  collection(name: string): CollectionDefinition
  list(context: AccessContext, name: string, query: ListQuery): Promise<ContentPage>
  read(
    context: AccessContext,
    name: string,
    id: string,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  create(
    context: AccessContext,
    name: string,
    input: CreateInput,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  update(
    context: AccessContext,
    name: string,
    id: string,
    input: UpdateInput,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  remove(context: AccessContext, name: string, id: string): Promise<void>
  publish(
    context: AccessContext,
    name: string,
    id: string,
    input: { readonly publishedBy?: string | null },
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  history(context: AccessContext, name: string, id: string): Promise<readonly VersionSummary[]>
  diff(
    context: AccessContext,
    name: string,
    id: string,
    from: number,
    to: number,
  ): Promise<ContentDiff>
  restore(
    context: AccessContext,
    name: string,
    id: string,
    version: number,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
}

/**
 * How many rows a filtered page may walk before it gives up and hands back a
 * cursor. Filters are evaluated above the store, so a very selective filter
 * over a large collection must not turn one request into an unbounded scan.
 */
const SCAN_BUDGET = 2_000
const SCAN_BATCH = 100

export function createContentService(options: ContentServiceOptions): ContentService {
  const limits: QueryLimits = { ...DEFAULT_LIMITS, ...options.limits }
  const permissions = options.permissions
  const byName = new Map(options.collections.map((collection) => [collection.name, collection]))
  const stores = new Map<string, ContentStore>()

  function collection(name: string): CollectionDefinition {
    const found = byName.get(name)
    if (found !== undefined) return found
    // Deliberately does not echo the name back: a 404 body is logged, cached and
    // shown, and nothing a caller typed belongs in any of the three.
    throw new CogentaError({
      code: 'CONTENT_NOT_FOUND',
      message: 'This collection does not exist.',
      hint: 'Check the collection segment of the path against the collections your schema declares.',
    })
  }

  function store(target: CollectionDefinition): ContentStore {
    const existing = stores.get(target.name)
    if (existing !== undefined) return existing
    const created = options.storeFor(target)
    stores.set(target.name, created)
    return created
  }

  function notFound(): CogentaError {
    return new CogentaError({
      code: 'CONTENT_NOT_FOUND',
      message: 'This entry does not exist, or is not visible to you.',
      hint: 'Check the identifier. An unpublished entry is invisible unless you may read drafts.',
    })
  }

  /**
   * The single place the draft rule is enforced.
   *
   * Every read path funnels through here, so "the `public` role never reaches a
   * draft, on any route, whatever the query says" is one function rather than a
   * condition each route has to remember.
   */
  function stateFor(
    target: CollectionDefinition,
    context: AccessContext,
    requested: EntryState,
  ): EntryState {
    if (requested === 'published') return 'published'

    const decision = permissions.canReadUnpublished(target, context)
    if (decision.allowed) return 'working'

    throw new CogentaError({
      code: 'FORBIDDEN',
      message: 'Unpublished content is not available to you.',
      hint: 'Sign in with a role that may read drafts, or use a valid preview token.',
    })
  }

  /**
   * The per-entry draft gate. Applied to every entry a read path is about to
   * return, never only at the front door.
   *
   * A published read needs no gate: the store cannot return an unpublished row
   * for one. A working read from an actor whose only claim is a preview grant
   * yields *that entry and nothing else* — not "every entry that happens to be
   * published", because the working face of a published entry is its pending
   * draft, and a token for entry A must not show it for entry B.
   */
  function draftGate(
    target: CollectionDefinition,
    context: AccessContext,
    state: EntryState,
  ): (entry: ContentEntry) => boolean {
    if (state === 'published') return () => true
    if (hasRoleDraftAccess(permissions, target, context)) return () => true
    return (entry) => previewCovers(context, target, entry.id)
  }

  /**
   * For routes that expose an entry's drafts by identifier rather than by
   * reading the row (history, diff). A grant for another entry must not open
   * them, and the answer is the same 404 a stranger gets.
   */
  function assertEntryDraftAccess(
    target: CollectionDefinition,
    context: AccessContext,
    id: string,
  ): void {
    if (hasRoleDraftAccess(permissions, target, context)) return
    if (previewCovers(context, target, id)) return
    throw notFound()
  }

  function expansionSource(context: AccessContext): ExpansionSource {
    return {
      collection: (name) => byName.get(name),
      store,
      canRead: (target) => permissions.can('read', target, context).allowed,
      canReadUnpublished: (target) => permissions.canReadUnpublished(target, context).allowed,
      canSeeEntry: (target, entry) => draftGate(target, context, 'working')(entry),
    }
  }

  async function serialise(
    context: AccessContext,
    target: CollectionDefinition,
    entry: ContentEntry,
    options_: ReadOptions,
  ): Promise<SerialisedEntry> {
    return serialiseEntry(entry, target, expansionSource(context), {
      depth: Math.min(Math.max(options_.depth, 0), limits.maxDepth),
      state: options_.state,
    })
  }

  function sortValue(entry: ContentEntry, field: SortOrder['field']): string {
    if (field === 'createdAt') return entry.createdAt
    if (field === 'updatedAt') return entry.updatedAt
    return entry.id
  }

  return {
    limits,
    collection,

    list: async (context, name, query) => {
      const target = collection(name)
      permissions.assert('read', target, context)

      const state = stateFor(target, context, query.requestedState)
      // A status other than `published` is a request for unpublished rows by
      // another name, and the store would honour it as written. The permission
      // is therefore required here too, not only for `state=working`.
      if (query.requestedStatus !== undefined && query.requestedStatus !== 'published') {
        stateFor(target, context, 'working')
      }

      const gate = draftGate(target, context, state)
      // One predicate, so the draft gate takes part in the same walk as the
      // filter: an entry a preview grant does not cover is not "hidden after
      // paging", it never counts towards the page or the cursor at all.
      const accept = (entry: ContentEntry): boolean =>
        gate(entry) && (query.filter === undefined || matchesFilter(query.filter, entry))

      const entries = store(target)
      const accepted: ContentEntry[] = []
      let scanned = 0
      let cursor = query.cursor
      let lastScanned: ContentEntry | undefined
      let exhausted = false
      let budgetSpent = false

      // Filters richer than equality are evaluated above the store, so a page is
      // built by walking the keyset until enough rows pass. One row beyond the
      // asked-for page is collected on purpose: its existence is the honest
      // answer to "is there more", and it never comes from a count query that
      // would race the concurrent inserts the cursor exists to survive.
      while (accepted.length <= query.limit) {
        const page = await entries.list({
          state,
          limit: SCAN_BATCH,
          sort: query.sort,
          ...(query.locale === undefined ? {} : { locale: query.locale }),
          ...(query.requestedStatus === undefined ? {} : { status: query.requestedStatus }),
          ...(cursor === undefined ? {} : { cursor }),
        })

        for (const entry of page.items) {
          scanned += 1
          lastScanned = entry
          if (accept(entry)) {
            accepted.push(entry)
            if (accepted.length > query.limit) break
          }
        }

        if (accepted.length > query.limit) break
        if (!page.hasMore || page.nextCursor === null) {
          exhausted = true
          break
        }
        if (scanned >= SCAN_BUDGET) {
          budgetSpent = true
          break
        }
        cursor = page.nextCursor
      }

      const overflowed = accepted.length > query.limit
      const items = accepted.slice(0, query.limit)
      const hasMore = overflowed || (!exhausted && budgetSpent)

      // The cursor is a position in the ordering, so it is taken from the last
      // row actually handed out — or, when the scan budget ran out before the
      // page filled, from the last row looked at, so the next request resumes
      // exactly where this one stopped instead of re-reading from the start.
      const anchor = overflowed ? items.at(-1) : lastScanned
      const nextCursor =
        hasMore && anchor !== undefined
          ? encodeCursor({
              field: query.sort.field,
              direction: query.sort.direction,
              value: sortValue(anchor, query.sort.field),
              id: anchor.id,
            })
          : null

      const serialised: SerialisedEntry[] = []
      for (const entry of items) {
        serialised.push(await serialise(context, target, entry, { state, depth: query.depth }))
      }

      return { items: serialised, nextCursor, hasMore }
    },

    read: async (context, name, id, readOptions) => {
      const target = collection(name)
      permissions.assert('read', target, context)

      const state = stateFor(target, context, readOptions.state)
      const entry = await store(target).read(id, { state })
      if (entry === null) throw notFound()
      // Same 404 as a missing entry: telling a caller "this exists but your
      // preview token is for another entry" is itself a disclosure.
      if (!draftGate(target, context, state)(entry)) throw notFound()

      return serialise(context, target, entry, { state, depth: readOptions.depth })
    },

    create: async (context, name, input, readOptions) => {
      const target = collection(name)
      permissions.assert('create', target, context)

      const entry = await store(target).create(input)
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    update: async (context, name, id, input, readOptions) => {
      const target = collection(name)
      permissions.assert('update', target, context)

      const entry = await store(target).update(id, input)
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    remove: async (context, name, id) => {
      const target = collection(name)
      permissions.assert('delete', target, context)

      const removed = await store(target).delete(id)
      if (!removed) throw notFound()
    },

    publish: async (context, name, id, input, readOptions) => {
      const target = collection(name)
      permissions.assert('publish', target, context)

      const entry = await store(target).publish(id, input)
      return serialise(context, target, entry, { state: 'published', depth: readOptions.depth })
    },

    history: async (context, name, id) => {
      const target = collection(name)
      permissions.assert('read', target, context)
      // History is the list of drafts by another name, so it needs the same
      // permission a draft read needs — including the entry-level half of it.
      stateFor(target, context, 'working')
      assertEntryDraftAccess(target, context, id)

      return store(target).history(id)
    },

    diff: async (context, name, id, from, to) => {
      const target = collection(name)
      permissions.assert('read', target, context)
      stateFor(target, context, 'working')
      assertEntryDraftAccess(target, context, id)

      return store(target).diff(id, from, to)
    },

    restore: async (context, name, id, version, readOptions) => {
      const target = collection(name)
      permissions.assert('update', target, context)

      const entry = await store(target).restore(id, version)
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },
  }
}
