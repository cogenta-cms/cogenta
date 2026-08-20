import { CogentaError } from '@cogenta/core'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from '../rest/http.js'
import type { Actor } from '../types.js'
import type { NoticeChannelBridge } from './channel-bridge.js'
import type { NoticeDismissalStore } from './dismissals.js'
import type { NoticeHistoryEntry, NoticeHistoryStore } from './history.js'
import type { AdminNotice, NoticeSeverity, NoticeSource } from './types.js'

/**
 * `/api/notices` — what the admin shows the person who is signed in,
 * `/api/notices/{id}/dismiss` to make one stop coming back, and, since fiche
 * 38 task 2, `/api/notices/history` (what has ever been shown, resolved or
 * not) and `/api/notices/read` (mark it seen in the notification centre).
 *
 * There is no route that reads or writes anyone else's notices, and no
 * parameter that names an account: everything is scoped to the actor the bearer
 * token resolved to. That is not a convention to remember at each call site,
 * it is the only shape the routes have (R4).
 */

export interface NoticeRouterOptions {
  readonly sources: readonly NoticeSource[]
  readonly dismissals: NoticeDismissalStore
  /**
   * "On retrouve une notice rejetée dans l'historique" (fiche 38 task 2).
   * Absent means `/api/notices/history` and `/api/notices/read` answer
   * `CONTENT_NOT_FOUND` rather than pretending to keep one — a deployment
   * that never wires a `NoticeHistoryStore` gets the exact behaviour it had
   * before this task, not a silently empty history.
   */
  readonly history?: NoticeHistoryStore
  /**
   * "Les canaux de `@cogenta/channels` sont réellement utilisables depuis un
   * site" (fiche 38 task 3). Fired, best-effort, for whatever `history.sync`
   * reports as newly appeared on every `GET /`. Requires `history` — there
   * is nothing to compare "new" against without it.
   */
  readonly channelBridge?: NoticeChannelBridge
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

function isNoticeSeverity(value: string): value is NoticeSeverity {
  return value === 'info' || value === 'success' || value === 'warning' || value === 'danger'
}

function historyToJson(entry: NoticeHistoryEntry) {
  return {
    id: entry.id,
    code: entry.code,
    severity: entry.severity,
    params: entry.params,
    action:
      entry.actionCode === null || entry.actionHref === null
        ? undefined
        : { code: entry.actionCode, href: entry.actionHref },
    dismissible: entry.dismissible,
    firstSeenAt: entry.firstSeenAt,
    lastSeenAt: entry.lastSeenAt,
    resolvedAt: entry.resolvedAt,
    readAt: entry.readAt,
  }
}

export function createNoticeRouter(options: NoticeRouterOptions): NoticeRouter {
  const { sources, dismissals, history, channelBridge } = options
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

          // History sees every notice a source currently emits — dismissed
          // or not, exactly what "what happened while I was away" needs —
          // never the filtered `visible` list. A dismissal hides a notice
          // from the board without making it stop having existed.
          if (history !== undefined) {
            const changed = await history.sync(actor.id, found)
            if (channelBridge !== undefined) {
              await channelBridge.notifyNew(actor.id, changed).catch(() => undefined)
            }
          }

          return jsonResponse(200, { data: visible })
        }

        if (segments.length === 1 && segments[0] === 'history') {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          if (actor.id === null) throw signedOut()
          if (history === undefined) throw noRoute()

          const severityParam = request.query['severity']
          const severity = typeof severityParam === 'string' ? severityParam : undefined
          if (severity !== undefined && !isNoticeSeverity(severity)) {
            throw new CogentaError({
              code: 'QUERY_INVALID',
              message: `"${severity}" is not a notice severity.`,
              hint: 'Use one of: info, success, warning, danger.',
            })
          }
          const sinceParam = request.query['since']
          const untilParam = request.query['until']

          const entries = await history.list(actor.id, {
            ...(severity === undefined ? {} : { severity }),
            ...(typeof sinceParam === 'string' ? { since: sinceParam } : {}),
            ...(typeof untilParam === 'string' ? { until: untilParam } : {}),
          })
          return jsonResponse(200, { data: entries.map(historyToJson) })
        }

        if (segments.length === 1 && segments[0] === 'read') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          if (actor.id === null) throw signedOut()
          if (history === undefined) throw noRoute()

          const body =
            typeof request.body === 'object' && request.body !== null
              ? (request.body as Record<string, unknown>)
              : {}
          if (body['all'] === true) {
            await history.markRead(actor.id, 'all')
          } else {
            const ids = Array.isArray(body['ids'])
              ? body['ids'].filter((id): id is string => typeof id === 'string')
              : []
            await history.markRead(actor.id, ids)
          }
          return { status: 204, body: null, headers: {} }
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
