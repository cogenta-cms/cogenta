import { CogentaError } from '@cogenta/core'
import type {
  CollectionDefinition,
  ContentAction,
  ContentStore,
  ReviewState,
} from '@cogenta/schema'
import type { SerialisedEntry } from '../content/index.js'
import { serialiseEntry } from '../content/index.js'
import type { AccessContext, PermissionLayer } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `GET /api/review` — the review queue, aggregated across every collection
 * that turned the editorial workflow on (`schema@2.1`, ADR-0027, fiche 37
 * task 3).
 *
 * The reason this is its own router rather than a filter on `/api/content`
 * (which already accepts `reviewState`/`assignedReviewer` at the store
 * level): the queue's whole point is "everything waiting for me, across
 * whichever collections I may review" — the same reasoning that already
 * made `/api/search` its own router rather than a per-collection query.
 *
 * Three scopes, one per tab the fiche asks for:
 *
 * - `assigned` — pending entries this actor is the named reviewer of. Needs
 *   `publish` on the collection: only someone who could approve it at all
 *   is shown it as "assigned to me".
 * - `pending`  — every entry pending review, assigned or not. Same gate.
 * - `mine`     — this actor's own submissions, any workflow state but
 *   `'none'`. Needs `update` — the same permission `submit` itself needs.
 *
 * A collection this actor may not `read` never contributes a row, whatever
 * the scope — the same "narrow twice" discipline `search-router.ts` uses.
 */

export type ReviewQueueScope = 'assigned' | 'pending' | 'mine'

export interface ReviewQueueItem {
  readonly collection: string
  readonly entry: SerialisedEntry
}

export interface ReviewRouterOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly permissions: PermissionLayer
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  /** Mount point. `/api/review` by default. */
  readonly basePath?: string
  /** Rows fetched per collection, before merging. Keeps one huge collection from starving the rest. */
  readonly perCollectionLimit?: number
}

export interface ReviewRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/review'
const DEFAULT_PER_COLLECTION_LIMIT = 50
const SCOPES: readonly ReviewQueueScope[] = ['assigned', 'pending', 'mine']

function parseScope(request: RestRequest): ReviewQueueScope {
  const raw = single(request.query, 'scope') ?? 'pending'
  if ((SCOPES as readonly string[]).includes(raw)) return raw as ReviewQueueScope
  throw new CogentaError({
    code: 'QUERY_INVALID',
    message: `"${raw}" is not a review queue scope.`,
    hint: `Use one of: ${SCOPES.join(', ')}.`,
    details: { scope: raw },
  })
}

export function createReviewRouter(options: ReviewRouterOptions): ReviewRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const perCollectionLimit = options.perCollectionLimit ?? DEFAULT_PER_COLLECTION_LIMIT
  const stores = new Map<string, ContentStore>()

  function store(collection: CollectionDefinition): ContentStore {
    const existing = stores.get(collection.name)
    if (existing !== undefined) return existing
    const created = options.storeFor(collection)
    stores.set(collection.name, created)
    return created
  }

  /**
   * Whether this actor holds one of the roles a rule names, **ignoring**
   * `own: true` (`schema@2.1`). This is a collection-scoped question —
   * "could this actor ever act on some entry here" — not the per-entry one
   * `PermissionLayer.can` answers; an own-scoped contributor still belongs
   * in their own "mine" tab even though no single entry's ownership has
   * been checked yet at this point.
   */
  function holdsRole(
    action: ContentAction,
    collection: CollectionDefinition,
    context: AccessContext,
  ): boolean {
    // The effective rule (fiche 63, ADR-0028) — a database override changing
    // who may `update`/`publish` this collection must move this scope's
    // membership too, not just `PermissionLayer.can()` itself.
    const roles = options.permissions.ruleFor(action, collection).roles
    const held = new Set(context.actor.roles)
    held.add('public')
    return roles.some((role) => held.has(role))
  }

  /** Collections with the workflow on, this actor may read, and are relevant to this scope. */
  function scopeCollections(
    scope: ReviewQueueScope,
    context: AccessContext,
  ): readonly CollectionDefinition[] {
    const gate = scope === 'mine' ? 'update' : 'publish'
    return options.collections.filter(
      (candidate) =>
        candidate.workflow?.enabled === true &&
        options.permissions.can('read', candidate, context).allowed &&
        holdsRole(gate, candidate, context),
    )
  }

  async function itemsFor(
    collection: CollectionDefinition,
    scope: ReviewQueueScope,
    context: AccessContext,
  ): Promise<readonly ReviewQueueItem[]> {
    const filter =
      scope === 'assigned'
        ? { reviewState: 'pending' as ReviewState, assignedReviewer: context.actor.id }
        : scope === 'pending'
          ? { reviewState: 'pending' as ReviewState }
          : { createdBy: context.actor.id }

    const page = await store(collection).list({
      state: 'working',
      limit: perCollectionLimit,
      ...filter,
    })

    const items =
      scope === 'mine' ? page.items.filter((entry) => entry.reviewState !== 'none') : page.items

    const source = {
      collection: (name: string) =>
        options.collections.find((candidate) => candidate.name === name),
      store,
      canRead: () => true,
      canReadUnpublished: () => true,
      canSeeEntry: () => true,
    }

    const serialised: ReviewQueueItem[] = []
    for (const entry of items) {
      serialised.push({
        collection: collection.name,
        entry: await serialiseEntry(entry, collection, source, { depth: 0, state: 'working' }),
      })
    }
    return serialised
  }

  async function handleReview(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const scope = parseScope(request)
    const collections = scopeCollections(scope, context)

    const gathered: ReviewQueueItem[] = []
    for (const collection of collections) {
      gathered.push(...(await itemsFor(collection, scope, context)))
    }

    // Oldest submission first: the queue's job is to stop something waiting
    // the longest from being the one nobody notices.
    gathered.sort((a, b) => a.entry.updatedAt.localeCompare(b.entry.updatedAt))

    return jsonResponse(200, {
      data: gathered,
      meta: { scope, collections: collections.map((collection) => collection.name) },
    })
  }

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        if (normalise(request.path.split('?')[0] ?? request.path) !== basePath) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: 'No route matches this path.',
            hint: 'The review queue route is GET /api/review?scope=pending|assigned|mine.',
          })
        }
        if (request.method.toUpperCase() !== 'GET') {
          return {
            status: 405,
            body: {
              error: {
                code: 'QUERY_INVALID',
                message: 'This method is not allowed.',
                hint: 'Use GET.',
              },
            },
            headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET' },
          }
        }
        return await handleReview(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
