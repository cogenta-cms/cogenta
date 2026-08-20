import type { AnalyticsStore, AnalyticsSummary, CountedPath, PageStats } from '@cogenta/analytics'
import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import {
  errorResponse,
  jsonResponse,
  queryError,
  type RestRequest,
  type RestResponse,
} from './http.js'
import { single } from './query.js'

/**
 * `/api/analytics` — self-hosted, cookie-free page-view analytics
 * (`@cogenta/analytics`).
 *
 * Two routes with opposite trust models, both under one path:
 *
 * - `GET /api/analytics/beacon` is the public collection endpoint a rendered
 *   page calls (see `theme-render.ts`'s inline beacon script). It is
 *   deliberately built to **never** surface a failure to the caller: a
 *   malformed request, a rate-limited session, or even a database error all
 *   produce the same `204 No Content` a well-behaved one gets. Analytics is a
 *   bonus (R1/R2 spirit) — breaking page rendering, or leaking *why* an event
 *   was not recorded, would cost more than the data is worth.
 * - `GET /api/analytics/summary` is the read side, restricted to `admin` for
 *   the same reason `/api/audit` is: aggregate traffic data about the whole
 *   site is not something every role should be able to browse.
 */

/** A top page enriched with where it lives in the admin — never present when `resolvePage` cannot place it (an entry deleted since, or a path no route matches). */
export interface EnrichedTopPage extends CountedPath {
  readonly title?: string
  readonly editHref?: string
}

export interface AnalyticsRouterOptions {
  readonly store: AnalyticsStore
  /**
   * The site's own hostname, so navigation between the site's own pages is
   * never recorded as a "referrer" (see `extractReferrerDomain`).
   */
  readonly siteHost?: string | undefined
  /** Mount point. `/api/analytics` by default. */
  readonly basePath?: string
  readonly now?: () => number
  /**
   * Resolves a stored path to the entry that lives there — the title and
   * admin link `GET .../summary`'s top-pages table shows (fiche 27 task 1).
   * Absent means the table shows the bare path only, exactly as before this
   * was wired: `@cogenta/analytics` itself knows nothing about collections or
   * routes, so this is the router's own seam, filled in by whoever mounts it
   * (`cogenta serve`, through the real content routes).
   *
   * `undefined` for "no entry there any more" — resolved permission-checked
   * against `actor`, never a bypass of R4.
   */
  readonly resolvePage?: (
    path: string,
    actor: Actor,
  ) => Promise<{ readonly title: string; readonly editHref: string } | undefined>
  /**
   * The site's configured events retention, shown on the summary screen
   * (fiche 27 task 3, "rétention affichée"). `undefined` when the caller did
   * not wire one in — the response then omits the field rather than
   * inventing a number nobody configured.
   */
  readonly retainDays?: number
}

export interface AnalyticsRequestContext {
  readonly actor: Actor
  /** The connecting client's address, resolved by the transport — never trusted input. */
  readonly ip: string
}

export interface AnalyticsRouter {
  handle(request: RestRequest, context: AnalyticsRequestContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/analytics'
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 90

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may read the analytics summary.',
    hint: 'Ask someone with the admin role to check this for you.',
  })
}

function parseWindowDays(request: RestRequest): number {
  const raw = single(request.query, 'days')
  if (raw === undefined) return DEFAULT_WINDOW_DAYS
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_WINDOW_DAYS) {
    throw queryError(
      'days',
      `is not a whole number between 1 and ${MAX_WINDOW_DAYS}`,
      `Pass 7, 30 or 90, or any whole number up to ${MAX_WINDOW_DAYS}.`,
    )
  }
  return parsed
}

/**
 * `?since=&until=` — the custom date range task 1 asks for, alongside the
 * fixed `?days=` window. Both absent means "use `?days=`"; only one present
 * is refused rather than guessed, the same way `?trashed=` refuses an
 * unrecognised value elsewhere in this API.
 */
function parseCustomRange(request: RestRequest): { since: Date; until: Date } | undefined {
  const sinceRaw = single(request.query, 'since')
  const untilRaw = single(request.query, 'until')
  if (sinceRaw === undefined && untilRaw === undefined) return undefined
  if (sinceRaw === undefined || untilRaw === undefined) {
    throw queryError(
      'since',
      'must be given together with "until"',
      'Pass both "since" and "until" as ISO-8601 dates, or use "days" instead.',
    )
  }

  const since = new Date(sinceRaw)
  const until = new Date(untilRaw)
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
    throw queryError(
      'since',
      'is not a valid ISO-8601 date',
      'Pass dates like 2026-01-01, or 2026-01-01T00:00:00.000Z.',
    )
  }
  if (since.getTime() >= until.getTime()) {
    throw queryError('since', 'must be before "until"', 'Swap the two dates.')
  }
  if (until.getTime() - since.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    throw queryError(
      'until',
      `spans more than ${MAX_WINDOW_DAYS} days from "since"`,
      `Pick a range of at most ${MAX_WINDOW_DAYS} days.`,
    )
  }
  return { since, until }
}

function resolveWindow(request: RestRequest, now: () => number): { since: Date; until: Date } {
  const custom = parseCustomRange(request)
  if (custom !== undefined) return custom
  const days = parseWindowDays(request)
  const until = new Date(now())
  return { since: new Date(until.getTime() - days * DAY_MS), until }
}

export function createAnalyticsRouter(options: AnalyticsRouterOptions): AnalyticsRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const now = options.now ?? Date.now

  async function beacon(
    request: RestRequest,
    context: AnalyticsRequestContext,
  ): Promise<RestResponse> {
    try {
      const path = single(request.query, 'p')
      const referrer = single(request.query, 'r')
      const userAgent = request.headers?.['user-agent']

      if (path !== undefined) {
        await options.store.recordEvent({
          path,
          ip: context.ip,
          ...(referrer === undefined ? {} : { referrer }),
          ...(userAgent === undefined ? {} : { userAgent }),
          ...(options.siteHost === undefined ? {} : { siteHost: options.siteHost }),
        })
      }
    } catch {
      // Never surfaced: see the module doc comment. Whatever went wrong, the
      // page that called this beacon must not learn or care.
    }
    return { status: 204, body: null, headers: {} }
  }

  async function summary(
    request: RestRequest,
    context: AnalyticsRequestContext,
  ): Promise<RestResponse> {
    requireAdmin(context.actor)
    const { since, until } = resolveWindow(request, now)

    const result: AnalyticsSummary = await options.store.getSummary({ since, until })

    // Top pages, enriched with a title and an admin edit link when the
    // caller wired one in (fiche 27 task 1). Resolved one at a time — the
    // list is capped at `DEFAULT_SUMMARY_LIMIT`, never a hot path — and a
    // failed or unresolved lookup falls back to the bare path rather than
    // failing the whole summary over one stale reference.
    const resolvePage = options.resolvePage
    const topPages: readonly EnrichedTopPage[] =
      resolvePage === undefined
        ? result.topPages
        : await Promise.all(
            result.topPages.map(async (page) => {
              const resolved = await resolvePage(page.path, context.actor).catch(() => undefined)
              return resolved === undefined
                ? page
                : { ...page, title: resolved.title, editHref: resolved.editHref }
            }),
          )

    return jsonResponse(200, {
      data: {
        ...result,
        topPages,
        retentionDays: options.retainDays ?? null,
      },
    })
  }

  async function page(
    request: RestRequest,
    context: AnalyticsRequestContext,
  ): Promise<RestResponse> {
    requireAdmin(context.actor)
    const path = single(request.query, 'path')
    if (path === undefined) {
      throw queryError('path', 'is required', 'Pass ?path=/the/page/path.')
    }
    const { since, until } = resolveWindow(request, now)

    const result: PageStats = await options.store.getPageStats({ path, since, until })
    return jsonResponse(200, { data: result })
  }

  return {
    handle: async (request, context) => {
      try {
        const path = normalise(request.path.split('?')[0] ?? request.path)
        const method = request.method.toUpperCase()

        if (path === `${basePath}/beacon`) {
          if (method !== 'GET') {
            return {
              status: 405,
              body: null,
              headers: { allow: 'GET' },
            }
          }
          return await beacon(request, context)
        }

        if (path === `${basePath}/summary`) {
          if (method !== 'GET') {
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
          return await summary(request, context)
        }

        if (path === `${basePath}/page`) {
          if (method !== 'GET') {
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
          return await page(request, context)
        }

        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: 'No route matches this path.',
          hint:
            'Analytics routes are GET /api/analytics/beacon, GET /api/analytics/summary and ' +
            'GET /api/analytics/page.',
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
