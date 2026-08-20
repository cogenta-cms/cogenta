import { CogentaError } from '@cogenta/core'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import type { MarketplaceCatalogLike, MarketplaceInstallerLike } from './marketplace-router.js'
import type { ListQuery } from './query.js'

/**
 * `GET /api/shell-status` — fiche 35 task 3.
 *
 * One aggregated request for everything the admin's chrome needs to draw a
 * badge or hide a nav group: how many trashed entries exist, whether the
 * catalogue has ever held a product, how many orders are stuck awaiting a
 * human, and how many installed marketplace items have a newer version in
 * the catalogue. This route exists to avoid exactly the failure mode the
 * fiche names — "a badge per nav entry is a request per nav entry", ten
 * round trips fired on every single navigation instead of one.
 *
 * Every field but `trash` degrades to `null`/`false` rather than refusing
 * the whole response when its own domain is unavailable to this actor —
 * the same "answer, not an error" shape `/api/assistant` already uses, so a
 * contributor who cannot see orders gets `commerceOrdersPending: null`
 * instead of the sidebar failing to render at all.
 *
 * The commerce and marketplace dependencies are structural (`*Like`),
 * mirroring the reasoning `marketplace-router.ts` already gives for staying
 * structural: `@cogenta/api` has never depended on `@cogenta/commerce`, and
 * this router calls a handful of read-only methods. `ContentService` itself
 * is reused as-is rather than duplicated — it already lives in this package.
 */

/**
 * The read this router needs from `ContentService` — `limits` (to cap a
 * trash scan at the same page size every other list already respects) and
 * `list` itself. A real `ContentService` satisfies this structurally; tests
 * fake only these two members rather than the whole interface.
 */
export interface ContentListProviderLike {
  readonly limits: { readonly maxPageSize: number }
  list(
    context: AccessContext,
    name: string,
    query: ListQuery,
  ): Promise<{ readonly items: readonly unknown[] }>
}

/** The two statuses that still need a human: awaiting payment, or awaiting shipment. */
const PENDING_ORDER_STATUSES = ['pending', 'paid'] as const

export interface CommerceOrdersLike {
  list(options: {
    readonly status: (typeof PENDING_ORDER_STATUSES)[number]
    readonly limit?: number
  }): Promise<readonly unknown[]>
}

export interface CommerceCatalogLike {
  listProducts(options: { readonly limit?: number }): Promise<readonly unknown[]>
}

/** `ReviewRouter` (`review-router.ts`), structural for the same reason commerce/marketplace are. */
export interface ReviewQueueLike {
  handle(
    request: RestRequest,
    context?: AccessContext,
  ): Promise<{ readonly status: number; readonly body: unknown }>
}

export interface ShellStatus {
  /** Trashed entries across every trash-enabled collection this actor may see the trash of. */
  readonly trash: number
  /** `null` when no commerce domain is mounted, or this actor holds no role at all. */
  readonly commerceOrdersPending: number | null
  /** Whether the catalogue has ever held a product — `false` sells nothing yet. */
  readonly commerceActive: boolean
  /** `null` when marketplace is unmounted, or this actor is not `admin` (the only role that can act on an update). */
  readonly marketplaceUpdates: number | null
  /** `null` when no collection has the editorial workflow on (`schema@2.1`, ADR-0027, fiche 37). */
  readonly reviewPending: number | null
}

export interface ShellStatusRouterOptions {
  readonly content: ContentListProviderLike
  /** Names of collections that keep a trash (`trash !== false`) — the only ones worth asking. Defaults to none. */
  readonly trashableCollections?: readonly string[]
  /** Absent on a site with no commerce tables — `commerceOrdersPending`/`commerceActive` then stay `null`/`false`. */
  readonly commerceOrders?: CommerceOrdersLike
  readonly commerceCatalog?: CommerceCatalogLike
  /** Both present together, or both absent — a marketplace with a catalogue and no installer (or the reverse) cannot answer "updates". */
  readonly marketplaceCatalog?: MarketplaceCatalogLike
  readonly marketplaceInstaller?: MarketplaceInstallerLike
  /** Absent on a site where no collection has `workflow: { enabled: true }` — `reviewPending` then stays `null`. */
  readonly reviewQueue?: ReviewQueueLike
  /** Mount point. `/api/shell-status` by default. */
  readonly path?: string
}

export interface ShellStatusRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_PATH = '/api/shell-status'

export function createShellStatusRouter(options: ShellStatusRouterOptions): ShellStatusRouter {
  const path = normalise(options.path ?? DEFAULT_PATH)

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        return await route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function route(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const requestPath = normalise(request.path.split('?')[0] ?? request.path)
    if (requestPath !== path) throw noRoute()
    if (request.method.toUpperCase() !== 'GET') return methodNotAllowed()

    // An anonymous visitor has no sidebar to draw a badge on — answered
    // rather than refused, the same "switched off is an answer" shape the
    // rest of this route already follows.
    if (context.actor.id === null) {
      const empty: ShellStatus = {
        trash: 0,
        commerceOrdersPending: null,
        commerceActive: false,
        marketplaceUpdates: null,
        reviewPending: null,
      }
      return jsonResponse(200, { data: empty })
    }

    const status: ShellStatus = {
      trash: await trashCount(context),
      commerceOrdersPending: await ordersPending(context),
      commerceActive: await catalogueHasProducts(),
      marketplaceUpdates: await pendingMarketplaceUpdates(context),
      reviewPending: await reviewPending(context),
    }
    return jsonResponse(200, { data: status })
  }

  async function trashCount(context: AccessContext): Promise<number> {
    let total = 0
    for (const name of options.trashableCollections ?? []) {
      const query: ListQuery = {
        filter: undefined,
        sort: { field: 'id', direction: 'asc' },
        limit: options.content.limits.maxPageSize,
        cursor: undefined,
        locale: undefined,
        requestedState: 'working',
        requestedStatus: undefined,
        trashed: 'only',
        depth: 0,
      }
      try {
        const page = await options.content.list(context, name, query)
        total += page.items.length
      } catch {
        // This actor may not see this collection's trash at all — the same
        // courtesy-only degrade every other field in this response uses
        // (R4: the real gate is `ContentService.list` itself, already run).
      }
    }
    return total
  }

  async function ordersPending(context: AccessContext): Promise<number | null> {
    const orders = options.commerceOrders
    if (orders === undefined) return null
    // Courtesy only (R4 — the commerce router is the real gate on order
    // data): the same `roles.length > 0` heuristic the admin's own commerce
    // screens already use client-side, so this answers `null` for exactly
    // the actor those screens would render nothing useful for either.
    if (context.actor.roles.length === 0) return null
    const counts = await Promise.all(
      PENDING_ORDER_STATUSES.map((status) => orders.list({ status })),
    )
    return counts.reduce((total, rows) => total + rows.length, 0)
  }

  async function catalogueHasProducts(): Promise<boolean> {
    const catalogue = options.commerceCatalog
    if (catalogue === undefined) return false
    const rows = await catalogue.listProducts({ limit: 1 })
    return rows.length > 0
  }

  async function reviewPending(context: AccessContext): Promise<number | null> {
    const queue = options.reviewQueue
    if (queue === undefined) return null
    const response = await queue.handle(
      { method: 'GET', path: '/api/review', query: { scope: 'pending' } },
      context,
    )
    if (response.status !== 200) return null
    const body = response.body as { readonly data?: readonly unknown[] } | undefined
    return body?.data?.length ?? null
  }

  async function pendingMarketplaceUpdates(context: AccessContext): Promise<number | null> {
    const catalogue = options.marketplaceCatalog
    const installer = options.marketplaceInstaller
    if (catalogue === undefined || installer === undefined) return null
    // Only `admin` can act on a marketplace update (`marketplace-router.ts`
    // itself gates every route the same way), so this answers `null` rather
    // than a number nobody holding this role could ever do anything about.
    if (!context.actor.roles.includes('admin')) return null

    const installed = await installer.list()
    let updates = 0
    for (const record of installed) {
      const entry = catalogue.get(record.itemId)
      const latest = entry?.changelog?.[0]?.version
      if (latest !== undefined && latest !== record.pluginVersion) updates += 1
    }
    return updates
  }
}

function methodNotAllowed(): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: 'Use GET.',
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET' },
  }
}

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'The shell status route is GET /api/shell-status.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
