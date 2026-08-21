import { CogentaError } from '@cogenta/core'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `GET /api/observability` — the admin's "Exploitation" > Observability
 * screen (fiche L22 task 5 point 3): the most recent HTTP request traces
 * and structured-log lines this one process has captured, when local
 * collection is on.
 *
 * Admin-only, read-only, and deliberately thin: every computation is
 * injected, the same shape `health-router.ts` already uses — this router
 * only decides HTTP shape and the permission check, never what a trace or a
 * log line contains. Nothing here can ever answer with a request body,
 * header or secret, because `@cogenta/observability`'s recent-events store
 * never stores one in the first place (see that package's own doc
 * comments).
 */

export interface ObservabilityTraceLike {
  readonly id: string
  readonly at: string
  readonly traceId: string
  readonly spanId: string
  readonly name: string
  readonly method: string | undefined
  readonly path: string | undefined
  readonly statusCode: number | undefined
  readonly durationMs: number
  readonly ok: boolean
}

export interface ObservabilityLogLike {
  readonly id: string
  readonly at: string
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  readonly msg: string
  readonly fields: Readonly<Record<string, unknown>> | undefined
}

export interface ObservabilityRouterOptions {
  /** Whether local collection is currently on — the `observability.enabled` site setting's live value. */
  readonly isEnabled: () => boolean
  readonly getRecentTraces: () => readonly ObservabilityTraceLike[]
  readonly getRecentLogs: () => readonly ObservabilityLogLike[]
  /** Mount point. `/api/observability` by default. */
  readonly basePath?: string
}

export interface ObservabilityRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/observability'

function forbidden(context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: 'Access denied: recent traces and logs can only be read by the admin role.',
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
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

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'The observability route is exactly one path: GET /api/observability.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function createObservabilityRouter(
  options: ObservabilityRouterOptions,
): ObservabilityRouter {
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
    const path = normalise(request.path.split('?')[0] ?? request.path)
    if (path !== basePath) throw noRoute()
    if (request.method.toUpperCase() !== 'GET') return methodNotAllowed(['GET'])
    if (!context.actor.roles.includes('admin')) throw forbidden(context)

    return jsonResponse(200, {
      data: {
        enabled: options.isEnabled(),
        traces: options.getRecentTraces(),
        logs: options.getRecentLogs(),
      },
    })
  }
}
