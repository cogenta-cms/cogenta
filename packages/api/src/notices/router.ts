import { CogentaError } from '@cogenta/core'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from '../rest/http.js'
import type { Actor } from '../types.js'
import type { NoticeDismissalStore } from './dismissals.js'
import type { AdminNotice, NoticeSource } from './types.js'

/**
 * `/api/notices` — what the admin shows the person who is signed in, and
 * `/api/notices/{id}/dismiss` to make one stop coming back.
 *
 * There is no route that reads or writes anyone else's notices, and no
 * parameter that names an account: everything is scoped to the actor the bearer
 * token resolved to. That is not a convention to remember at each call site,
 * it is the only shape the routes have (R4).
 */

export interface NoticeRouterOptions {
  readonly sources: readonly NoticeSource[]
  readonly dismissals: NoticeDismissalStore
  /** Mount point. `/api/notices` by default. */
  readonly basePath?: string
}

export interface NoticeRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/notices'

function signedOut(): CogentaError {
  return new CogentaError({
    code: 'UNAUTHENTICATED',
    message: 'Notices are personal: sign in to see yours.',
    hint: 'Send "Authorization: Bearer <token>" from an existing session.',
  })
}

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'Notice routes are GET /api/notices and POST /api/notices/{id}/dismiss.',
  })
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null
  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
}

export function createNoticeRouter(options: NoticeRouterOptions): NoticeRouter {
  const { sources, dismissals } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  /**
   * One source throwing must not take the whole list with it. A notice is
   * advisory: an admin screen that fails to load because a recommendation could
   * not be computed is strictly worse than one missing recommendation, and the
   * mechanism is meant to grow more sources over time — each of which would
   * otherwise be a new way for the page to break.
   */
  async function collect(actor: Actor): Promise<AdminNotice[]> {
    const collected: AdminNotice[] = []
    for (const source of sources) {
      const found = await source.list({ actor }).catch(() => [])
      collected.push(...found)
    }
    return collected
  }

  return {
    handle: async (request, actor) => {
      try {
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()

        if (segments.length === 0) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          if (actor.id === null) throw signedOut()

          const [found, hidden] = await Promise.all([
            collect(actor),
            dismissals.dismissed(actor.id),
          ])
          // A non-dismissible notice is shown even if a dismissal row exists
          // for it: the source can change its mind about whether something may
          // be waved away, and an old row must not silence it for ever.
          const visible = found.filter((notice) => !notice.dismissible || !hidden.has(notice.id))
          return jsonResponse(200, { data: visible })
        }

        if (segments.length === 2 && segments[1] === 'dismiss') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          if (actor.id === null) throw signedOut()
          const noticeId = segments[0] ?? ''

          // Only a notice this actor is actually being shown, and only one the
          // source says may be dismissed. Otherwise the route is a free write
          // of arbitrary strings into a table, and "dismissible: false" would
          // mean nothing more than a hidden button.
          const match = (await collect(actor)).find((notice) => notice.id === noticeId)
          if (match === undefined) throw noRoute()
          if (!match.dismissible) {
            throw new CogentaError({
              code: 'FORBIDDEN',
              message: 'This notice cannot be dismissed.',
              hint: 'It disappears on its own once what it reports is resolved.',
            })
          }

          await dismissals.dismiss(actor.id, noticeId)
          return { status: 204, body: null, headers: {} }
        }

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
