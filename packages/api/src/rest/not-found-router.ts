import { CogentaError } from '@cogenta/core'
import type { NotFoundLogEntry, NotFoundLogStore } from '@cogenta/schema'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `GET /api/not-found` — the log of public URLs that answered a 404 (fiche
 * 12 task 1), the missing half of the "so what should I redirect?" question
 * a redirect table alone cannot answer.
 *
 *   GET    /api/not-found              list, sorted by hit count (?limit=)
 *   DELETE /api/not-found?path=/x      dismiss one tracked path
 *
 * Admin-only, on both methods, for the same reason `/api/redirects` is: this
 * is a routing/operations concern, never content a visitor reads. Writing
 * the log itself (`NotFoundLogStore.record`) happens on the public GET path
 * in `cogenta serve`, entirely outside this router — this router only ever
 * *reads* or *dismisses* what has already been recorded.
 */

export interface NotFoundRouterOptions {
  readonly store: NotFoundLogStore
  /** Mount point. `/api/not-found` by default. */
  readonly basePath?: string
}

export interface NotFoundRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/not-found'

function serialise(entry: NotFoundLogEntry): NotFoundLogEntry {
  return entry
}

function forbidden(context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: 'Access denied: the not-found log can only be read by the admin role.',
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext): void {
  if (context.actor.roles.includes('admin')) return
  throw forbidden(context)
}

export function createNotFoundRouter(options: NotFoundRouterOptions): NotFoundRouter {
  const { store } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

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
    if (normalise(request.path.split('?')[0] ?? request.path) !== basePath) throw noRoute()
    const method = request.method.toUpperCase()

    assertAdmin(context)

    if (method === 'GET') {
      const raw = single(request.query, 'limit')
      const limit = raw === undefined ? undefined : Number(raw)
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        throw new CogentaError({
          code: 'QUERY_INVALID',
          message: 'The "limit" query parameter must be a whole number of 1 or more.',
          hint: 'Send a positive integer, or omit "limit".',
        })
      }
      const entries = await store.list(limit === undefined ? {} : { limit })
      return jsonResponse(200, { data: entries.map(serialise) })
    }

    if (method === 'DELETE') {
      const path = single(request.query, 'path')
      if (path === undefined || path.length === 0) {
        throw new CogentaError({
          code: 'QUERY_INVALID',
          message: 'The "path" query parameter is required.',
          hint: 'Send DELETE /api/not-found?path=/missing-page.',
        })
      }
      const removed = await store.remove(path)
      if (!removed) {
        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: `"${path}" is not in the not-found log.`,
          hint: 'It may already have been dismissed, or never recorded.',
          details: { path },
        })
      }
      return jsonResponse(204, null)
    }

    return methodNotAllowed(['GET', 'DELETE'])
  }
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

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'The not-found log route is GET/DELETE /api/not-found.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
