import type { AuthStore, LoginResult, User } from '@cogenta/auth'
import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/auth/*` — sign-in, its second factor, and "who am I".
 *
 * Deliberately narrow for a first pass: password login, TOTP completion, and
 * session lookup/revoke. Passkey ceremonies and TOTP enrolment need a
 * challenge held between two requests (`@cogenta/auth`'s own doc says this is
 * an API-layer concern, not the auth package's), and are not built yet —
 * tracked for L2 task 3 rather than rushed in alongside this router.
 *
 * Same shape as the REST router: a plain request in, a plain response out,
 * nothing that listens on a port. `resolveActor` is exported separately
 * because the content routes need it too — every request's actor comes from
 * the same bearer-token lookup, not two different ones that could disagree.
 */

export interface AuthRouterOptions {
  readonly auth: AuthStore
  /** Mount point. `/api/auth` by default. */
  readonly basePath?: string
}

export interface AuthRouter {
  handle(request: RestRequest): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/auth'

function bearerToken(headers: RestRequest['headers']): string | null {
  const raw = headers?.['authorization']
  if (raw === undefined) return null
  const match = /^Bearer\s+(.+)$/iu.exec(raw)
  return match?.[1]?.trim() ?? null
}

/**
 * The actor a request authenticates as, for every route — not just this
 * router's own `/session`.
 *
 * A missing or invalid token is never an error here: it just means the
 * request proceeds as `ANONYMOUS`, the same as if no `Authorization` header
 * were sent at all. Only `/api/auth/session` itself treats "no valid session"
 * as something to report, because that route exists to answer exactly that
 * question.
 */
export async function resolveActor(
  auth: AuthStore,
  headers: RestRequest['headers'],
): Promise<Actor> {
  const token = bearerToken(headers)
  if (token === null) return ANONYMOUS

  const session = await auth.sessions.resolve(token)
  if (session === null) return ANONYMOUS

  const user = await auth.users.byId(session.userId)
  if (user === null || user.status !== 'active') return ANONYMOUS

  return { id: user.id, roles: user.roles }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'The request body must be a JSON object.',
      hint: 'Send a JSON object with the fields this route expects.',
    })
  }
  return body as Record<string, unknown>
}

function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"${field}" is required and must be a non-empty string.`,
      hint: `Send "${field}" in the request body.`,
    })
  }
  return value
}

function loginResponseBody(result: LoginResult): unknown {
  if (result.status === 'session') {
    return {
      status: 'session',
      session: {
        id: result.session.id,
        token: result.session.token,
        expiresAt: result.session.expiresAt,
      },
      user: { id: result.user.id, email: result.user.email, roles: result.user.roles },
    }
  }
  return {
    status: 'mfa_required',
    ticket: result.ticket,
    availableFactors: result.availableFactors,
  }
}

function whoami(user: User): unknown {
  return { id: user.id, email: user.email, roles: user.roles, status: user.status }
}

function sessionInvalid(): CogentaError {
  return new CogentaError({
    code: 'AUTH_SESSION_INVALID',
    message: 'No active session.',
    hint: 'Sign in, then send the returned token as "Authorization: Bearer <token>".',
  })
}

export function createAuthRouter(options: AuthRouterOptions): AuthRouter {
  const auth = options.auth
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request) => {
      try {
        return await route(request)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function route(request: RestRequest): Promise<RestResponse> {
    const segments = segmentsOf(request.path, basePath)
    if (segments === null || segments.length !== 1) throw noRoute()
    const method = request.method.toUpperCase()
    const [action] = segments

    if (action === 'login') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      const body = asRecord(request.body)
      const result = await auth.login.passwordLogin(
        stringField(body, 'email'),
        stringField(body, 'password'),
      )
      return jsonResponse(200, { data: loginResponseBody(result) })
    }

    if (action === 'totp') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      const body = asRecord(request.body)
      const result = await auth.login.totpLogin(
        stringField(body, 'ticket'),
        stringField(body, 'token'),
      )
      return jsonResponse(200, { data: loginResponseBody(result) })
    }

    if (action === 'session') {
      if (method === 'GET') {
        const token = bearerToken(request.headers)
        const session = token === null ? null : await auth.sessions.resolve(token)
        if (session === null) throw sessionInvalid()

        const user = await auth.users.byId(session.userId)
        if (user === null) throw sessionInvalid()
        return jsonResponse(200, { data: whoami(user) })
      }

      if (method === 'DELETE') {
        const token = bearerToken(request.headers)
        if (token !== null) {
          const session = await auth.sessions.resolve(token)
          if (session !== null) await auth.sessions.revoke(session.id)
        }
        return { status: 204, body: null, headers: {} }
      }

      return methodNotAllowed(['GET', 'DELETE'])
    }

    throw noRoute()
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
    hint: 'Auth routes are /api/auth/login, /api/auth/totp and /api/auth/session.',
  })
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
