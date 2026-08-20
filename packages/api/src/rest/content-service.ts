import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentAction,
  type ContentDiff,
  type ContentEntry,
  type ContentStatus,
  type ContentStore,
  type CreateInput,
  type DuplicateInput,
  type EntryState,
  enrichWordDiffs,
  normalisePermissionRule,
  type RouteMatch,
  resolveUrl,
  type SortOrder,
  type UpdateInput,
  type VersionSummary,
} from '@cogenta/schema'
import {
  assertUnpublishedReadable,
  cursorFor,
  draftGateFor,
  type ExpansionSource,
  entryVisible,
  matchesFilter,
  type SerialisedEntry,
  scanPages,
  serialiseEntry,
} from '../content/index.js'
import type { AccessContext, PermissionLayer } from '../types.js'
import {
  lookupFilter,
  NO_REDIRECTS,
  type PathResolution,
  type RoutingOptions,
} from './path-resolution.js'
import { DEFAULT_LIMITS, type ListQuery, type QueryLimits } from './query.js'

/**
 * REST's composition of the shared content layer.
 *
 * Every decision REST and GraphQL must agree on — who may read, which face of
 * the content, which entries a preview grant covers, how a filter answers, where
 * a cursor points — comes from `src/content/`. What is REST's own is the *shape*
 * of the answer: one response carries the entry with its relations already
 * expanded to depth, because a REST client cannot ask for a second hop. GraphQL
 * composes the very same primitives lazily, per field, through its dataloader.
 *
 * Nothing in this file mentions HTTP; the router owns paths and status codes.
 */

export interface ContentServiceOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly permissions: PermissionLayer
  /** How to reach the persistence layer for a collection. */
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  readonly limits?: Partial<QueryLimits>
  /** Locales and redirect table used to turn a URL into an entry. */
  readonly routing?: RoutingOptions
}

export interface ContentPage {
  readonly items: readonly SerialisedEntry[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

/**
 * Per-status row counts for one readable collection (fiche 22 tâche 1's
 * dashboard summary, and fiche 01 tâche 4's per-collection tabs — the same
 * `ContentStore.count()` underneath both).
 *
 * `draft`/`scheduled`/`archived`/`trashed` are `null`, not `0`, for an actor
 * who may not read this collection's unpublished rows or its trash — the
 * same leak L1's own spec names: telling a role that cannot read drafts that
 * there are exactly zero of them is itself information a `0` it can never
 * see change would not be. `total` follows the same rule: it counts only
 * what this actor could ever see.
 */
export interface CollectionCounts {
  readonly collection: string
  readonly total: number
  readonly published: number
  readonly draft: number | null
  readonly scheduled: number | null
  readonly archived: number | null
  readonly trashed: number | null
}

export interface ReadOptions {
  readonly state: EntryState
  readonly depth: number
}

export interface ContentService {
  readonly limits: QueryLimits
  /** Throws `CONTENT_NOT_FOUND` when the schema declares no such collection. */
  collection(name: string): CollectionDefinition
  /**
   * The same lookup without the refusal.
   *
   * Deriving a response's dependencies walks whatever the payload holds,
   * including a relation into a collection the schema no longer declares; that
   * walk asks a question, it does not make a demand.
   */
  definition(name: string): CollectionDefinition | undefined
  list(context: AccessContext, name: string, query: ListQuery): Promise<ContentPage>
  /**
   * How many live (non-trashed) entries this collection holds, by status
   * (fiche 01 "Liste de contenu", task 4).
   *
   * Goes through the same permission layer as `list`, never around it: a
   * role that may not read drafts gets `published` only — not `draft: 0`,
   * not `draft: 12`. Either number would answer a question about drafts
   * that role is not entitled to ask (the fiche's own "piège connu": *the
   * count itself is what leaks*, not just the rows behind it).
   */
  counts(
    context: AccessContext,
    name: string,
  ): Promise<Readonly<Partial<Record<ContentStatus, number>>>>
  /**
   * Status counts for every collection this actor may read, in one call.
   *
   * Built for the dashboard's content summary widget (fiche 22 tâche 1): "one
   * aggregated request for every collection, not one per collection" — the
   * N+1 the fiche's own piège warns a per-widget-per-collection dashboard
   * turns into on a twenty-collection site. Internally this still runs one
   * `ContentStore.count()` per collection (each a single `GROUP BY`), but the
   * caller pays for exactly one HTTP round trip.
   */
  summary(context: AccessContext): Promise<readonly CollectionCounts[]>
  read(
    context: AccessContext,
    name: string,
    id: string,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  /**
   * What a site URL resolves to: an entry, a redirect, or nothing.
   *
   * The renderer knows a URL and nothing else, so this is the one read path
   * keyed on a path rather than on an identifier. It answers through the same
   * permission and draft layer as `read` — a `public` actor resolves published
   * content only, and a preview grant resolves its own entry and no other.
   */
  resolvePath(context: AccessContext, path: string, options: ReadOptions): Promise<PathResolution>
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
  /** Moves an entry to the trash (`schema@2.0`), or deletes it outright when the collection declares `trash: false`. */
  remove(context: AccessContext, name: string, id: string): Promise<void>
  /** Takes an entry back out of the trash, with the status it went in with. */
  untrash(
    context: AccessContext,
    name: string,
    id: string,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  /** The real delete: nothing is kept, and nothing comes back. */
  purge(context: AccessContext, name: string, id: string): Promise<void>
  publish(
    context: AccessContext,
    name: string,
    id: string,
    input: { readonly publishedBy?: string | null },
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  /**
   * Takes an entry back off the published face, into `draft` or `archived`.
   *
   * The direct inverse of `publish`, so it is guarded by the same `publish`
   * action rather than a sixth verb — contract A's action vocabulary stays
   * frozen at five, same reasoning as `untrash`/`purge` reusing `delete`.
   */
  unpublish(
    context: AccessContext,
    name: string,
    id: string,
    input: { readonly status?: 'draft' | 'archived' | 'scheduled'; readonly publishedAt?: string },
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  /**
   * Copies one entry into a new draft (`ContentStore.duplicate`).
   *
   * Guarded by `create`: a duplicate is a new entry, not a change to the
   * source, so whoever may create in this collection may duplicate within it.
   */
  duplicate(
    context: AccessContext,
    name: string,
    id: string,
    input: DuplicateInput,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  /**
   * Sends an entry into the review queue (`schema@2.1`, ADR-0027). Guarded by
   * `update` — same as the store: submitting your own finished work is
   * ordinary authoring, not a distinct permission.
   */
  submit(
    context: AccessContext,
    name: string,
    id: string,
    input: { readonly reviewerId?: string | null },
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  /** Approves a pending entry. Guarded by `publish` — **not** publication itself. */
  approve(
    context: AccessContext,
    name: string,
    id: string,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  /** Sends a pending entry back to its author. Guarded by `publish`, same reasoning as `approve`. */
  requestChanges(
    context: AccessContext,
    name: string,
    id: string,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  /** Sets — or clears — who is expected to review an entry next. Guarded by `update`. */
  assignReviewer(
    context: AccessContext,
    name: string,
    id: string,
    reviewerId: string | null,
    options: ReadOptions,
  ): Promise<SerialisedEntry>
  history(context: AccessContext, name: string, id: string): Promise<readonly VersionSummary[]>
  /** Every live entry of the translation family `id` belongs to (ADR-0014) — itself included, one per locale. */
  translations(
    context: AccessContext,
    name: string,
    id: string,
  ): Promise<readonly SerialisedEntry[]>
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
  /**
   * The translation dashboard (fiche 10 task 1): every root entry of a
   * collection (`translationOf: null`), each with the locale-by-locale state
   * of its family — absent, drafted, published, or published-but-obsolete
   * (task 2: the source changed since this translation was last written).
   *
   * One paginated query for the roots plus one batched query for every
   * translation of that page (`ContentStore.translationsOfMany`) — never a
   * `translations()` call per row, which is exactly the "N × M built by N
   * requests" the fiche's own "piège connu" warns against.
   *
   * Permission note, honestly stated rather than silently assumed: contract A
   * has no per-locale permission — a role reads or does not read a
   * *collection*, never "this collection, but not in Spanish". Every cell
   * still passes through the same per-entry draft gate `list()` uses (so a
   * preview grant or a role without unpublished access sees exactly what it
   * would see from `list()`), but a role that could invent "cannot read
   * Spanish" has nowhere in today's `PermissionLayer` to declare it. Adding
   * that dimension is a permission-model change, not a dashboard change, and
   * is out of this fiche's scope.
   *
   * Signal (a) inherits one more honest limit from `ContentEntry.updatedAt`
   * itself: on a `versioning.drafts` collection, editing an already-published
   * entry lands as a version overlay and does not move the live row's
   * `updatedAt` until that edit is published (the same clock `history()` and
   * every response's cache tags already key off). A pending, unpublished
   * edit to the source therefore does not yet mark a translation obsolete —
   * publishing it does. Fiche 10 picked (a) precisely for being free and
   * honest, not exact; this is that trade-off, not a bug.
   */
  translationMatrix(
    context: AccessContext,
    name: string,
    query: TranslationMatrixQuery,
  ): Promise<TranslationMatrixPage>
}

export interface TranslationMatrixQuery {
  readonly cursor?: string
  readonly limit: number
  readonly sort: SortOrder
}

export type TranslationMatrixState = ContentStatus | 'absent'

export interface TranslationMatrixCell {
  readonly id: string
  readonly status: ContentStatus
  readonly updatedAt: string
  /** Task 2's signal (a), stated as a fact: the source's `updatedAt` is later than this translation's. Always `false` for the root's own cell. */
  readonly obsolete: boolean
}

export interface TranslationMatrixEntry {
  /** The root entry (`translationOf: null`) — its `values` are what a title is derived from client-side, the same convention every other list uses. */
  readonly root: SerialisedEntry
  /** Keyed by locale, including the root's own. A missing key means "absent": no entry of that locale exists in this family, or the actor may not see the one that does. */
  readonly cells: Readonly<Record<string, TranslationMatrixCell>>
}

export interface TranslationMatrixPage {
  readonly items: readonly TranslationMatrixEntry[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
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
  const routing: RoutingOptions = options.routing ?? {}
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

  /**
   * `permissions.assert`, aware of a rule's `own: true` clause (`schema@2.1`,
   * ADR-0027).
   *
   * Reads the entry first **only** when the rule actually needs it — a
   * collection that never declares `own` pays nothing extra, same as before
   * this existed. `existing` lets a caller that already has the row (a
   * transition that just read it for its own reasons) skip a second read.
   */
  async function assertOwnAware(
    target: CollectionDefinition,
    action: ContentAction,
    context: AccessContext,
    id: string,
    existing?: ContentEntry | null,
  ): Promise<void> {
    const rule = normalisePermissionRule(target.permissions[action])
    if (!rule.own) {
      permissions.assert(action, target, context)
      return
    }
    const entry =
      existing !== undefined ? existing : await store(target).read(id, { state: 'working' })
    permissions.assert(action, target, context, entry?.createdBy ?? null)
  }

  function notFound(): CogentaError {
    return new CogentaError({
      code: 'CONTENT_NOT_FOUND',
      message: 'This entry does not exist, or is not visible to you.',
      hint: 'Check the identifier. An unpublished entry is invisible unless you may read drafts.',
    })
  }

  /**
   * The state this request is entitled to, for a transport that lets the caller
   * *ask* for one.
   *
   * `state=working` is a request for unpublished rows, so the draft guard from
   * `src/content/` answers it — the same guard GraphQL derives its state from,
   * which is what makes "the `public` role never reaches a draft, on any route,
   * whatever the query says" one rule rather than two habits.
   */
  function stateFor(
    target: CollectionDefinition,
    context: AccessContext,
    requested: EntryState,
  ): EntryState {
    if (requested === 'published') return 'published'
    assertUnpublishedReadable(permissions, target, context)
    return 'working'
  }

  /** The per-entry gate, applied to every row a read path is about to return. */
  function draftGate(
    target: CollectionDefinition,
    context: AccessContext,
    state: EntryState,
  ): (entry: ContentEntry) => boolean {
    const gate = draftGateFor(permissions, target, context, state)
    return (entry) => gate(entry.id)
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
    if (entryVisible(permissions, target, context, 'working', id)) return
    throw notFound()
  }

  /**
   * The entry a matched route points at, or null.
   *
   * Deliberately the same gate as `read`, reached from a path instead of an
   * identifier: `stateFor` decides which face of the content this request is
   * entitled to — and refuses outright when an actor asks for the working state
   * it may not have — and `draftGate` then narrows a working read to the entries
   * a preview grant actually covers.
   *
   * The lookup runs against the live row's columns. An unpublished *rename* is
   * therefore not reachable by its new path even in preview: the new slug is in
   * a version row, and the URL it will be served at does not exist yet.
   */
  async function lookupRoute(
    context: AccessContext,
    match: RouteMatch,
    requested: EntryState,
  ): Promise<ContentEntry | null> {
    const target = collection(match.collection)
    const state = stateFor(target, context, requested)

    const page = await store(target).list({
      state,
      where: lookupFilter(target, match.params),
      limit: 1,
      ...(match.locale === null ? {} : { locale: match.locale }),
    })

    const entry = page.items[0]
    if (entry === undefined) return null
    // Same silence as a missing entry: "this path exists but your token is for
    // another entry" is itself a disclosure, so it resolves to nothing and the
    // redirect table gets its turn.
    return draftGate(target, context, state)(entry) ? entry : null
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

  return {
    limits,
    collection,
    definition: (name) => byName.get(name),

    list: async (context, name, query) => {
      const target = collection(name)
      permissions.assert('read', target, context)

      // Reaching into the trash needs `delete` on top of `read` (ADR-0022
      // keeps the five actions frozen, so the trash borrows the action that
      // put things there). It is also, by definition, unpublished content —
      // hence the working-state gate as well.
      if (query.trashed !== undefined && query.trashed !== 'exclude') {
        permissions.assert('delete', target, context)
        stateFor(target, context, 'working')
      }

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
      const scan = await scanPages<ContentEntry>({
        limit: query.limit,
        accept,
        startCursor: query.cursor,
        maxRows: SCAN_BUDGET,
        fetch: (cursor) =>
          entries.list({
            state,
            limit: SCAN_BATCH,
            sort: query.sort,
            ...(query.locale === undefined ? {} : { locale: query.locale }),
            ...(query.trashed === undefined ? {} : { trashed: query.trashed }),
            ...(query.requestedStatus === undefined ? {} : { status: query.requestedStatus }),
            ...(cursor === undefined ? {} : { cursor }),
          }),
      })

      // REST's own policy on the walk's outcome. A scan that ran out of budget
      // before it filled the page has *not* proved there is nothing left, so it
      // reports more and hands back a cursor: the alternative is telling a
      // caller a selective filter matched nothing when it merely matched late.
      const hasMore = scan.overflowed || (!scan.exhausted && scan.budgetSpent)

      // The cursor is a position in the ordering, so it is taken from the last
      // row actually handed out — or, when the scan budget ran out before the
      // page filled, from the last row looked at, so the next request resumes
      // exactly where this one stopped instead of re-reading from the start.
      const anchor = scan.overflowed ? scan.items.at(-1) : scan.lastScanned
      const nextCursor = hasMore && anchor !== undefined ? cursorFor(anchor, query.sort) : null

      const serialised: SerialisedEntry[] = []
      for (const entry of scan.items) {
        serialised.push(await serialise(context, target, entry, { state, depth: query.depth }))
      }

      return { items: serialised, nextCursor, hasMore }
    },

    counts: async (context, name) => {
      const target = collection(name)
      permissions.assert('read', target, context)

      const raw = await store(target).count()
      const byStatus: Readonly<Partial<Record<ContentStatus, number>>> = {
        draft: raw.draft,
        scheduled: raw.scheduled,
        published: raw.published,
        archived: raw.archived,
      }
      if (permissions.canReadUnpublished(target, context).allowed) return byStatus

      // Only the published count is safe to hand back — see the interface
      // comment above.
      return { published: raw.published }
    },

    summary: async (context) => {
      const readable = options.collections.filter(
        (candidate) => permissions.can('read', candidate, context).allowed,
      )

      return Promise.all(
        readable.map(async (target): Promise<CollectionCounts> => {
          const counts = await store(target).count()
          // The same two gates `list()` itself applies to reach unpublished
          // rows and the trash — a count is a read, and it must leak nothing
          // a read could not already tell this actor.
          const canUnpublished = permissions.canReadUnpublished(target, context).allowed
          const canTrash = permissions.can('delete', target, context).allowed

          return {
            collection: target.name,
            published: counts.published,
            total: canUnpublished ? counts.total : counts.published,
            draft: canUnpublished ? counts.draft : null,
            scheduled: canUnpublished ? counts.scheduled : null,
            archived: canUnpublished ? counts.archived : null,
            trashed: canTrash ? counts.trashed : null,
          }
        }),
      )
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

    resolvePath: async (context, path, readOptions) => {
      // Only routed collections this actor may read at all take part in the
      // match. A collection whose `read` is closed must not answer a URL, and
      // leaving it in the table would let a stranger learn its route shape from
      // which paths behave differently.
      const routable = options.collections.filter(
        (candidate) =>
          candidate.routing !== undefined && permissions.can('read', candidate, context).allowed,
      )

      const resolution = await resolveUrl(path, {
        collections: routable,
        redirects: routing.redirects ?? NO_REDIRECTS,
        ...(routing.locales === undefined ? {} : { locales: routing.locales }),
        ...(routing.defaultLocale === undefined ? {} : { defaultLocale: routing.defaultLocale }),
        lookup: (match) => lookupRoute(context, match, readOptions.state),
      })

      if (resolution.kind === 'redirect') {
        return { kind: 'redirect', to: resolution.to, status: resolution.status }
      }
      if (resolution.kind === 'notFound') return { kind: 'notFound' }

      // `lookup` is the only thing that puts an entry here, and it returns a
      // `ContentEntry` of the matched collection; the cast is the price of
      // `resolveUrl` staying ignorant of the persistence layer's types.
      const entry = resolution.entry as ContentEntry
      const target = collection(resolution.match.collection)
      const state = stateFor(target, context, readOptions.state)

      return {
        kind: 'entry',
        collection: target.name,
        locale: resolution.match.locale,
        params: resolution.match.params,
        entry: await serialise(context, target, entry, { state, depth: readOptions.depth }),
      }
    },

    create: async (context, name, input, readOptions) => {
      const target = collection(name)
      permissions.assert('create', target, context)

      const entry = await store(target).create(input)
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    update: async (context, name, id, input, readOptions) => {
      const target = collection(name)
      await assertOwnAware(target, 'update', context, id)

      const entry = await store(target).update(id, input)
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    remove: async (context, name, id) => {
      const target = collection(name)
      await assertOwnAware(target, 'delete', context, id)

      const removed = await store(target).delete(id)
      if (!removed) throw notFound()
    },

    /**
     * Takes an entry back out of the trash (`schema@2.0`, ADR-0022).
     *
     * Guarded by `delete`, not `update`: the action vocabulary of contract A
     * is frozen at five, and un-deleting is the inverse of the action that
     * created the state — whoever may throw a thing away may take it back.
     */
    untrash: async (context, name, id, readOptions) => {
      const target = collection(name)
      permissions.assert('delete', target, context)

      const entry = await store(target).untrash(id)
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    /** The real delete. Also `delete`: purging is deleting, not a sixth verb. */
    purge: async (context, name, id) => {
      const target = collection(name)
      permissions.assert('delete', target, context)

      const removed = await store(target).purge(id)
      if (!removed) throw notFound()
    },

    publish: async (context, name, id, input, readOptions) => {
      const target = collection(name)
      permissions.assert('publish', target, context)

      const entry = await store(target).publish(id, input)
      return serialise(context, target, entry, { state: 'published', depth: readOptions.depth })
    },

    unpublish: async (context, name, id, input, readOptions) => {
      const target = collection(name)
      permissions.assert('publish', target, context)

      const entry = await store(target).unpublish(id, input)
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    submit: async (context, name, id, input, readOptions) => {
      const target = collection(name)
      await assertOwnAware(target, 'update', context, id)

      const entry = await store(target).submitForReview(id, {
        by: context.actor.id,
        ...(input.reviewerId === undefined ? {} : { reviewerId: input.reviewerId }),
      })
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    approve: async (context, name, id, readOptions) => {
      const target = collection(name)
      permissions.assert('publish', target, context)

      const entry = await store(target).approveReview(id, { by: context.actor.id })
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    requestChanges: async (context, name, id, readOptions) => {
      const target = collection(name)
      permissions.assert('publish', target, context)

      const entry = await store(target).requestReviewChanges(id, { by: context.actor.id })
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    assignReviewer: async (context, name, id, reviewerId, readOptions) => {
      const target = collection(name)
      await assertOwnAware(target, 'update', context, id)

      const entry = await store(target).assignReviewer(id, reviewerId)
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    duplicate: async (context, name, id, input, readOptions) => {
      const target = collection(name)
      permissions.assert('create', target, context)

      const entry = await store(target).duplicate(id, {
        ...input,
        createdBy: input.createdBy ?? context.actor.id,
      })
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
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

    translations: async (context, name, id) => {
      const target = collection(name)
      permissions.assert('read', target, context)
      // Same gate as history: the family of an entry an actor may not see the
      // draft of is not theirs to enumerate either.
      stateFor(target, context, 'working')
      assertEntryDraftAccess(target, context, id)

      const all = await store(target).translations(id)
      return Promise.all(
        all.map((entry) => serialise(context, target, entry, { state: 'working', depth: 0 })),
      )
    },

    diff: async (context, name, id, from, to) => {
      const target = collection(name)
      permissions.assert('read', target, context)
      stateFor(target, context, 'working')
      assertEntryDraftAccess(target, context, id)

      // Task 06-3: a corrected word must show as a corrected word, not
      // "changed" — computed here rather than inside `ContentStore.diff`, so
      // every existing caller of the store's own diff (agents included) keeps
      // getting the plain structural diff it has always returned.
      return enrichWordDiffs(await store(target).diff(id, from, to))
    },

    restore: async (context, name, id, version, readOptions) => {
      const target = collection(name)
      await assertOwnAware(target, 'update', context, id)

      const entry = await store(target).restore(id, version)
      return serialise(context, target, entry, { state: 'working', depth: readOptions.depth })
    },

    translationMatrix: async (context, name, query) => {
      const target = collection(name)
      permissions.assert('read', target, context)
      // Every cell answers a working-state question ("does a draft exist at
      // all") — the same gate `history`/`translations` require.
      stateFor(target, context, 'working')

      const gate = draftGate(target, context, 'working')
      const entries = store(target)

      const scan = await scanPages<ContentEntry>({
        limit: query.limit,
        accept: gate,
        startCursor: query.cursor,
        maxRows: SCAN_BUDGET,
        fetch: (cursor) =>
          entries.list({
            state: 'working',
            translationOf: null,
            limit: SCAN_BATCH,
            sort: query.sort,
            ...(cursor === undefined ? {} : { cursor }),
          }),
      })

      const hasMore = scan.overflowed || (!scan.exhausted && scan.budgetSpent)
      const anchor = scan.overflowed ? scan.items.at(-1) : scan.lastScanned
      const nextCursor = hasMore && anchor !== undefined ? cursorFor(anchor, query.sort) : null

      const roots = scan.items
      const rootIds = roots.map((entry) => entry.id)
      // One batched query for every translation of this page's roots — the
      // "N × M, one query, one join" the fiche's own piège connu insists on.
      const translations = (await entries.translationsOfMany(rootIds)).filter(gate)

      const byRoot = new Map<string, ContentEntry[]>()
      for (const translation of translations) {
        const key = translation.translationOf ?? ''
        const bucket = byRoot.get(key)
        if (bucket === undefined) byRoot.set(key, [translation])
        else bucket.push(translation)
      }

      const items: TranslationMatrixEntry[] = []
      for (const root of roots) {
        const cells: Record<string, TranslationMatrixCell> = {
          [root.locale]: {
            id: root.id,
            status: root.status,
            updatedAt: root.updatedAt,
            obsolete: false,
          },
        }
        for (const translation of byRoot.get(root.id) ?? []) {
          cells[translation.locale] = {
            id: translation.id,
            status: translation.status,
            updatedAt: translation.updatedAt,
            // Signal (a) from the fiche: a fact ("the source changed since"),
            // not a verdict — deliberately a plain string comparison of two
            // ISO 8601 timestamps, which sort the same as they compare.
            obsolete: root.updatedAt > translation.updatedAt,
          }
        }
        items.push({
          root: await serialise(context, target, root, { state: 'working', depth: 0 }),
          cells,
        })
      }

      return { items, nextCursor, hasMore }
    },
  }
}
