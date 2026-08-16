import type { AnalyticsStore, AnalyticsSummary } from '@cogenta/analytics'
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
    const days = parseWindowDays(request)
    const until = new Date(now())
    const since = new Date(until.getTime() - days * DAY_MS)

    const result: AnalyticsSummary = await options.store.getSummary({ since, until })
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

        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: 'No route matches this path.',
          hint: 'Analytics routes are GET /api/analytics/beacon and GET /api/analytics/summary.',
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
