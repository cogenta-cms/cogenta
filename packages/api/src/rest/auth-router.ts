import { createHash } from 'node:crypto'
import type { AuthStore, LoginResult, User } from '@cogenta/auth'
import { looksLikeApiKey } from '@cogenta/auth'
import { CogentaError, type RateLimitDriver } from '@cogenta/core'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { Actor } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { assertPasswordPolicy } from './password-policy.js'

/** One request-quota window: a minute, the unit fiche 20 states the quota in. */
const REQUEST_QUOTA_WINDOW_MS = 60_000

/**
 * `/api/auth/*` — sign-in, its second factor, first-time TOTP enrolment,
 * passkey registration and passkey sign-in, and "who am I".
 *
 * Same shape as the REST router: a plain request in, a plain response out,
 * nothing that listens on a port. `resolveActor` is exported separately
 * because the content routes need it too — every request's actor comes from
 * the same bearer-token lookup, not two different ones that could disagree.
 */

/** What redeeming a forgotten-password token successfully produced, for `onForgotPassword`. */
export interface ForgotPasswordEvent {
  readonly user: User
  readonly token: string
  readonly expiresAt: string
}

export interface AuthRouterOptions {
  readonly auth: AuthStore
  /** Mount point. `/api/auth` by default. */
  readonly basePath?: string
  /**
   * Delivers the reset token issued by `POST /api/auth/forgot-password`.
   *
   * Absent from this package on purpose: sending mail needs `@cogenta/channels`
   * and a site's mail directory, neither of which this transport-agnostic
   * router knows about (R9 — no new dependency here just to send one kind of
   * mail). `cogenta serve` wires this to the same `sendResetMail` the
   * `cogenta users reset-password --email` terminal command already uses
   * (`packages/cli/src/reset-mail.ts`), so the wording is written once.
   *
   * Never awaited by the route in a way that could change its response or its
   * timing in an observable way tied to whether the email existed — see the
   * route's own comment for the account-enumeration rule this exists to keep.
   */
  readonly onForgotPassword?: (event: ForgotPasswordEvent) => Promise<void>
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
 *
 * Two bearer shapes resolve here, never confused with each other: a session
 * token (`sessions.resolve`, minted at sign-in for a human) and an API key
 * (`apiKeys.verify`, minted by an admin for a script — L13 task 8). A key's
 * `cogenta_sk_` prefix decides which lookup runs; a key never reaches more
 * than the roles it was explicitly granted, and its actor id is prefixed so
 * it can never collide with — or be mistaken for — a real user id in the
 * audit log or a `me` route.
 *
 * `requestQuota` (fiche 20 task 3) is checked only for a key that already
 * resolved successfully — a session-authenticated human, and a request that
 * fails to authenticate at all, are both untouched by it. Omitting it (the
 * default) keeps this function's existing behaviour byte for byte, which is
 * what lets every caller that does not care about the quota — most tests
 * included — go on not caring.
 */
export async function resolveActor(
  auth: AuthStore,
  headers: RestRequest['headers'],
  options: { readonly requestQuota?: RateLimitDriver } = {},
): Promise<Actor> {
  const token = bearerToken(headers)
  if (token === null) return ANONYMOUS

  if (looksLikeApiKey(token)) return resolveApiKeyActor(auth, token, options.requestQuota)

  const session = await auth.sessions.resolve(token)
  if (session === null) return ANONYMOUS

  const user = await auth.users.byId(session.userId)
  if (user === null || user.status !== 'active') return ANONYMOUS

  return { id: user.id, roles: user.roles }
}

/**
 * Rate-limited the same way a password guess is: repeatedly retrying one
 * wrong key is slowed down, keyed on a hash of the attempted key rather than
 * on any caller-supplied identity, since an unrecognised key has none.
 * Brute-forcing the 256-bit key space itself is infeasible regardless — this
 * defends against a leaked-and-retried or misconfigured key hammering the
 * server, the same failure mode the login rate limit defends against.
 *
 * A *valid* key is a different case entirely (fiche 20 task 3): it is not
 * being guessed, it is doing real work, and the request quota exists so that
 * a leaked-but-real key cannot read the whole site as fast as the network
 * allows. That failure is loud, not swallowed into `ANONYMOUS` — the caller
 * is who it says it is, and deserves a `429` naming when it may try again,
 * not a `403` that looks like it was never authenticated at all.
 */
async function resolveApiKeyActor(
  auth: AuthStore,
  token: string,
  requestQuota: RateLimitDriver | undefined,
): Promise<Actor> {
  const subject = `apikey:${createHash('sha256').update(token).digest('base64url')}`
  try {
    await auth.rateLimit.check(subject)
  } catch {
    // Backed off, the same way a missing or invalid token degrades: never an
    // error out of `resolveActor`, just no actor.
    return ANONYMOUS
  }

  const key = await auth.apiKeys.verify(token)
  if (key === null) {
    await auth.rateLimit.record(subject)
    return ANONYMOUS
  }
  await auth.rateLimit.clear(subject)

  if (requestQuota !== undefined) {
    const result = await requestQuota.consume(`apikey:${key.id}`, {
      limit: key.rateLimitPerMinute,
      windowMs: REQUEST_QUOTA_WINDOW_MS,
    })
    if (!result.allowed) {
      throw new CogentaError({
        code: 'API_KEY_RATE_LIMITED',
        message: `This key is limited to ${result.limit} requests per minute.`,
        hint: 'Wait for the quota to reset, or ask an admin to raise this key’s limit.',
        details: { limit: result.limit, remaining: result.remaining, resetAt: result.resetAt },
      })
    }
  }

  return { id: `apikey:${key.id}`, roles: key.scope }
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

function objectField(body: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = body[field]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"${field}" is required and must be an object.`,
      hint: `Send the browser's WebAuthn "${field}" object as-is.`,
    })
  }
  return value as Record<string, unknown>
}

function unauthenticated(what: string): CogentaError {
  return new CogentaError({
    code: 'UNAUTHENTICATED',
    message: `Sign in before ${what}.`,
    hint: 'Send "Authorization: Bearer <token>" from an existing session.',
  })
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
  const onForgotPassword = options.onForgotPassword
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
    if (segments === null || segments.length === 0) throw noRoute()
    const method = request.method.toUpperCase()
    const [action] = segments

    if (action === 'webauthn') return webauthnRoute(request, segments, method)
    if (action === 'totp') return totpRoute(request, segments, method)
    if (segments.length !== 1) throw noRoute()

    if (action === 'login') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      const body = asRecord(request.body)
      const result = await auth.login.passwordLogin(
        stringField(body, 'email'),
        stringField(body, 'password'),
      )
      return jsonResponse(200, { data: loginResponseBody(result) })
    }

    if (action === 'forgot-password') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      return forgotPassword(asRecord(request.body))
    }

    if (action === 'reset-password') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      return resetPassword(asRecord(request.body))
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

  /**
   * `POST /api/auth/forgot-password` — the whole point of this route is that
   * its answer must never depend on whether `email` names a real account.
   *
   * **The line that must never move**: every branch below returns the exact
   * same 200 with the exact same body, and the rate limiter is checked and
   * recorded against the submitted email *before* the account lookup, on the
   * same subject regardless of whether it turns out to exist — an attacker
   * probing for valid addresses gets backed off exactly as fast either way
   * (the same reasoning `loginAttempts` already applies to a wrong password,
   * see `tables.ts`). Only a real account gets a token issued and mail sent,
   * and that work happens after the branches have already agreed on what the
   * response will be, so nothing downstream of it can leak into this response.
   */
  async function forgotPassword(body: Record<string, unknown>): Promise<RestResponse> {
    const email = stringField(body, 'email').trim().toLowerCase()
    const subject = `forgot-password:${email}`

    await auth.rateLimit.check(subject)
    await auth.rateLimit.record(subject)

    const user = await auth.users.byEmail(email)
    if (user !== null && user.status === 'active') {
      const issued = await auth.resets.issue(user.id)
      if (onForgotPassword !== undefined) {
        await onForgotPassword({ user, token: issued.token, expiresAt: issued.expiresAt })
      }
    }

    return jsonResponse(200, {
      data: {
        message: 'If an account exists for this address, a reset link has been sent to it.',
      },
    })
  }

  /**
   * `POST /api/auth/reset-password` — redeems a token from the mail
   * `forgot-password` sent.
   *
   * Unlike `forgot-password`, this route's refusal *can* say why (invalid,
   * expired, already used): the secret here is the token itself, not whether
   * an email exists, and the token is not guessable — knowing enough to ask
   * this question at all already proves possession of the mail.
   */
  async function resetPassword(body: Record<string, unknown>): Promise<RestResponse> {
    const token = stringField(body, 'token')
    const newPassword = stringField(body, 'newPassword')
    assertPasswordPolicy(newPassword)

    const outcome = await auth.resets.redeem(token)
    if (outcome.kind !== 'ready') {
      throw new CogentaError({
        code: 'AUTH_RESET_TOKEN_INVALID',
        message:
          outcome.kind === 'expired'
            ? 'This reset link has expired.'
            : outcome.kind === 'used'
              ? 'This reset link has already been used.'
              : 'This reset link is not valid.',
        hint: 'Ask for a new one from the "forgot password" screen.',
      })
    }

    const user = await auth.users.byId(outcome.userId)
    if (user === null) {
      throw new CogentaError({
        code: 'AUTH_RESET_TOKEN_INVALID',
        message: 'The account this link belonged to no longer exists.',
        hint: 'Ask for a new one from the "forgot password" screen.',
      })
    }

    await auth.credentials.setPassword(user.id, newPassword)
    // Whoever knew the old password may still hold a live session, and a
    // reset that leaves them signed in has reset nothing — the same reasoning
    // `cogenta users reset-password --token` already follows.
    await auth.sessions.revokeAll(user.id)
    // A successful reset is proof of legitimate access; nothing left over
    // from a stranger's guessing should still count against this account.
    await auth.rateLimit.clear(`forgot-password:${user.email.toLowerCase()}`)

    // This same route is also where an invited account (fiche 17 task 1)
    // sets its very first password — the invitation reuses this exact token
    // primitive rather than a second one, on the fiche's own instruction.
    // Redeeming it is what turns "invited" into "active": nothing else in
    // the product ever flips that bit.
    if (user.status === 'invited') await auth.users.setStatus(user.id, 'active')

    return jsonResponse(200, { data: { reset: true } })
  }

  /**
   * `/api/auth/totp*` — one route that answers with a session, and three that
   * manage the factor for an account that is already signed in.
   *
   * The split matters. `POST /api/auth/totp` completes a sign-in and is
   * therefore reachable without a session, on the strength of the ticket the
   * password step issued. The other three are self-service: the account they
   * touch is the one the bearer token resolves to, never one named in the
   * request, so there is no shape of request that lets one person enrol or
   * disable a second factor on someone else's account (R4).
   *
   * Since ADR-0021 there is no ticket-driven enrolment at all: nobody is turned
   * away at sign-in for lacking a second factor, so nothing needs to hand out
   * proof that a password step happened for the purpose of enrolling one.
   */
  async function totpRoute(
    request: RestRequest,
    segments: readonly string[],
    method: string,
  ): Promise<RestResponse> {
    if (segments.length === 1) {
      if (method === 'POST') {
        const body = asRecord(request.body)
        const result = await auth.login.totpLogin(
          stringField(body, 'ticket'),
          stringField(body, 'token'),
        )
        return jsonResponse(200, { data: loginResponseBody(result) })
      }

      if (method === 'DELETE') {
        const actor = await resolveActor(auth, request.headers)
        if (actor.id === null) throw unauthenticated('turning off two-step verification')
        await auth.login.disableTotp(actor.id)
        return { status: 204, body: null, headers: {} }
      }

      return methodNotAllowed(['POST', 'DELETE'])
    }

    if (segments.length === 2 && segments[1] === 'enrol') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      const actor = await resolveActor(auth, request.headers)
      if (actor.id === null) throw unauthenticated('setting up two-step verification')
      return jsonResponse(200, { data: await auth.login.beginTotpEnrolment(actor.id) })
    }

    if (segments.length === 3 && segments[1] === 'enrol' && segments[2] === 'confirm') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      const actor = await resolveActor(auth, request.headers)
      if (actor.id === null) throw unauthenticated('setting up two-step verification')
      await auth.login.confirmTotpEnrolment(actor.id, stringField(asRecord(request.body), 'token'))
      return jsonResponse(200, { data: { enrolled: true } })
    }

    throw noRoute()
  }

  /**
   * `/api/auth/webauthn/{register|login}/{begin|complete}` — three segments,
   * routed apart from everything else above because registration's `begin`
   * needs the caller's actor (an existing session adding a passkey) while
   * every other WebAuthn step, like login itself, does not.
   */
  async function webauthnRoute(
    request: RestRequest,
    segments: readonly string[],
    method: string,
  ): Promise<RestResponse> {
    if (segments.length !== 3) throw noRoute()
    if (method !== 'POST') return methodNotAllowed(['POST'])
    const [, resource, step] = segments

    if (resource === 'register' && step === 'begin') {
      const actor = await resolveActor(auth, request.headers)
      if (actor.id === null) throw unauthenticated('registering a passkey')
      const challenge = await auth.login.beginWebAuthnRegistration(actor.id)
      return jsonResponse(200, { data: challenge })
    }

    if (resource === 'register' && step === 'complete') {
      const body = asRecord(request.body)
      const label = typeof body['label'] === 'string' ? body['label'] : undefined
      await auth.login.completeWebAuthnRegistration(
        stringField(body, 'ticket'),
        objectField(body, 'response') as unknown as RegistrationResponseJSON,
        label,
      )
      return jsonResponse(200, { data: { registered: true } })
    }

    if (resource === 'login' && step === 'begin') {
      const challenge = await auth.login.beginWebAuthnLogin()
      return jsonResponse(200, { data: challenge })
    }

    if (resource === 'login' && step === 'complete') {
      const body = asRecord(request.body)
      const result = await auth.login.completeWebAuthnLogin(
        stringField(body, 'ticket'),
        objectField(body, 'response') as unknown as AuthenticationResponseJSON,
      )
      return jsonResponse(200, { data: loginResponseBody(result) })
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
    hint:
      'Auth routes are /api/auth/login, /api/auth/forgot-password, ' +
      '/api/auth/reset-password, /api/auth/totp, /api/auth/totp/enrol, ' +
      '/api/auth/totp/enrol/confirm, /api/auth/session, and ' +
      '/api/auth/webauthn/{register|login}/{begin|complete}.',
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
