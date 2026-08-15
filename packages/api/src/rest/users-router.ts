import { randomBytes } from 'node:crypto'
import type { AuthStore, User } from '@cogenta/auth'
import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/users` — L11 task 3, the account management the admin never had.
 *
 * Until now the only way to create an account was `cogenta users create` on a
 * terminal, which is fine for the very first admin and hopeless for everything
 * after it.
 *
 * Two access rules, and only two, so there is nothing subtle to get wrong:
 *
 *  - **Anything about somebody else needs `admin`.** Listing accounts, creating
 *    one, changing a role, disabling one, reading or revoking another person's
 *    sessions. `requireAdmin` is called before the route body runs, never
 *    inside it (R4: the runtime checks, the operation does not).
 *  - **Your own account is yours.** Reading your profile, listing your sessions,
 *    revoking one of them, changing your own password. `me` resolves to the
 *    actor the bearer token produced, so "your own" is never something a request
 *    can claim.
 *
 * Changing *somebody else's* password is deliberately absent. That is a
 * password reset, it needs a delivery channel and a single-use token to be
 * anything other than a back door, and it is L13's task — an admin who could
 * silently set another account's password could sign in as them, which the
 * audit log would record as that person rather than as the admin.
 */

export interface UsersRouterOptions {
  readonly auth: AuthStore
  /** Mount point. `/api/users` by default. */
  readonly basePath?: string
}

export interface UsersRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/users'

/**
 * Long enough that scrypt is the attacker's only option, short of a leak.
 * Checked here rather than in `hashPassword`, which refuses only what it cannot
 * hash: a length policy is a product decision, and the CLI's generated
 * passwords are far longer than this anyway.
 */
const MIN_PASSWORD_LENGTH = 12

/** Base64url, so it is safe to read off a screen and paste back with no escaping. */
function generatePassword(): string {
  return randomBytes(24).toString('base64url')
}

function requireAdmin(actor: Actor, what: string): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: `Only the admin role may ${what}.`,
    hint: 'Ask someone with the admin role to do this for you.',
  })
}

function requireSelfOrAdmin(actor: Actor, userId: string, what: string): void {
  if (actor.id === userId) return
  requireAdmin(actor, what)
}

function requireSignedIn(actor: Actor): string {
  if (actor.id !== null) return actor.id
  throw new CogentaError({
    code: 'UNAUTHENTICATED',
    message: 'Sign in first.',
    hint: 'Send "Authorization: Bearer <token>" from an existing session.',
  })
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

function rolesField(body: Record<string, unknown>, field: string): readonly string[] {
  const value = body[field]
  if (!Array.isArray(value) || value.length === 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"${field}" must be a non-empty array of role names.`,
      hint: 'An account with no role can sign in and see nothing at all.',
    })
  }
  const roles = value.map((role) => (typeof role === 'string' ? role.trim() : ''))
  if (roles.some((role) => role.length === 0)) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `Every entry in "${field}" must be a non-empty role name.`,
      hint: 'Role names are an open set (contract A) but they are still names.',
    })
  }
  return roles
}

function statusField(value: unknown): User['status'] {
  if (value === 'active' || value === 'disabled') return value
  throw new CogentaError({
    code: 'QUERY_INVALID',
    message: '"status" must be either "active" or "disabled".',
    hint: 'Accounts are disabled, never deleted — an account that wrote content still has to be nameable.',
  })
}

function assertPasswordPolicy(password: string): void {
  if (password.length >= MIN_PASSWORD_LENGTH) return
  throw new CogentaError({
    code: 'AUTH_PASSWORD_INVALID',
    message: `A password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    hint: 'A passphrase of a few ordinary words is both longer and easier to remember than a short one with symbols in it.',
  })
}

interface MfaSummary {
  readonly totp: boolean
  readonly passkeys: number
}

/** What a user looks like on the wire, plus what second factors they hold. */
function publicUser(user: User, mfa: MfaSummary): unknown {
  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    mfa,
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
      'User routes are /api/users, /api/users/{id|me}, /api/users/{id|me}/sessions, ' +
      '/api/users/{id|me}/sessions/{sessionId} and /api/users/me/password.',
  })
}

function userNotFound(): CogentaError {
  return new CogentaError({
    code: 'AUTH_USER_NOT_FOUND',
    message: 'No account with that id.',
    hint: 'It may have been created on a different site, or the id may be mistyped.',
  })
}

export function createUsersRouter(options: UsersRouterOptions): UsersRouter {
  const { auth } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  async function mfaOf(userId: string): Promise<MfaSummary> {
    const totp = await auth.credentials.totpSecret(userId)
    const passkeys = await auth.credentials.webAuthnCredentials(userId)
    // An unconfirmed secret is not a factor — sign-in ignores it too
    // (`enrolledFactors` in `@cogenta/auth`), so reporting it as "on" here
    // would tell someone they are protected when they are not.
    return { totp: totp !== null && totp.verified, passkeys: passkeys.length }
  }

  /**
   * Refuses any change that would leave the site with no way back in.
   *
   * Demoting or disabling the last active admin is not a permission question —
   * the person doing it is allowed to — it is a locked door with the key on the
   * inside. There is no recovery path in this product yet (password reset is
   * L13), so this is the only thing standing between one careless click and a
   * site nobody can administer.
   */
  async function assertAdminRemains(
    target: User,
    next: { readonly roles?: readonly string[]; readonly status?: User['status'] },
  ): Promise<void> {
    const roles = next.roles ?? target.roles
    const status = next.status ?? target.status
    const stillAdmin = status === 'active' && roles.includes('admin')
    if (stillAdmin) return
    if (!(target.status === 'active' && target.roles.includes('admin'))) return

    const others = (await auth.users.list()).filter(
      (candidate) =>
        candidate.id !== target.id &&
        candidate.status === 'active' &&
        candidate.roles.includes('admin'),
    )
    if (others.length > 0) return

    throw new CogentaError({
      code: 'FORBIDDEN',
      message: 'This is the only active admin account: the change would lock everyone out.',
      hint: 'Give another account the admin role first, then come back to this one.',
    })
  }

  /** `me` is the actor's own id, and never anything a request can spell differently. */
  function resolveUserId(raw: string, actor: Actor): string {
    return raw === 'me' ? requireSignedIn(actor) : raw
  }

  return {
    handle: async (request, actor) => {
      try {
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()

        if (segments.length === 0) return await collectionRoute(request, actor, method)

        const userId = resolveUserId(segments[0] ?? '', actor)

        if (segments.length === 1) return await userRoute(request, actor, userId, method)

        if (segments[1] === 'password' && segments.length === 2) {
          return await passwordRoute(request, actor, userId, method)
        }

        if (segments[1] === 'sessions') {
          return await sessionsRoute(actor, userId, segments[2], method)
        }

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function collectionRoute(
    request: RestRequest,
    actor: Actor,
    method: string,
  ): Promise<RestResponse> {
    if (method === 'GET') {
      requireAdmin(actor, 'list the accounts on this site')
      const role = single(request.query, 'role')
      const all = await auth.users.list()
      const filtered = role === undefined ? all : all.filter((user) => user.roles.includes(role))
      const withMfa = await Promise.all(
        filtered.map(async (user) => publicUser(user, await mfaOf(user.id))),
      )
      return jsonResponse(200, { data: withMfa })
    }

    if (method === 'POST') {
      requireAdmin(actor, 'create an account')
      const body = asRecord(request.body)
      const email = stringField(body, 'email')
      const roles = rolesField(body, 'roles')

      // The password is generated, never chosen by the admin creating the
      // account: the same rule `cogenta users create` already follows. It is
      // returned once, in this response, and stored only as a hash — an admin
      // who picked it would know it, and a person's password should be
      // something only they know as soon as they have signed in once.
      const password = generatePassword()
      const user = await auth.users.create({ email, roles })
      await auth.credentials.setPassword(user.id, password)

      return jsonResponse(201, {
        data: { user: publicUser(user, { totp: false, passkeys: 0 }), password },
      })
    }

    return methodNotAllowed(['GET', 'POST'])
  }

  async function userRoute(
    request: RestRequest,
    actor: Actor,
    userId: string,
    method: string,
  ): Promise<RestResponse> {
    if (method === 'GET') {
      requireSelfOrAdmin(actor, userId, "read another account's profile")
      const user = await auth.users.byId(userId)
      if (user === null) throw userNotFound()
      return jsonResponse(200, { data: publicUser(user, await mfaOf(user.id)) })
    }

    if (method === 'PATCH') {
      requireAdmin(actor, 'change an account')
      const body = asRecord(request.body)
      const user = await auth.users.byId(userId)
      if (user === null) throw userNotFound()

      const roles = body['roles'] === undefined ? undefined : rolesField(body, 'roles')
      const status = body['status'] === undefined ? undefined : statusField(body['status'])
      if (roles === undefined && status === undefined) {
        throw new CogentaError({
          code: 'QUERY_INVALID',
          message: 'Nothing to change: send "roles", "status", or both.',
          hint: 'A password is changed by its own owner, at /api/users/me/password.',
        })
      }

      await assertAdminRemains(user, {
        ...(roles === undefined ? {} : { roles }),
        ...(status === undefined ? {} : { status }),
      })

      if (roles !== undefined) await auth.users.setRoles(userId, roles)
      if (status !== undefined) {
        await auth.users.setStatus(userId, status)
        // Disabling an account that is signed in somewhere has to end those
        // sessions too. `resolveActor` already refuses a disabled user, so this
        // is belt and braces — but a revoked row is the thing an operator can
        // actually see, and "disabled" that leaves live sessions listed reads
        // like the revocation did not happen.
        if (status === 'disabled') await auth.sessions.revokeAll(userId)
      }

      const updated = await auth.users.byId(userId)
      if (updated === null) throw userNotFound()
      return jsonResponse(200, { data: publicUser(updated, await mfaOf(userId)) })
    }

    return methodNotAllowed(['GET', 'PATCH'])
  }

  async function passwordRoute(
    request: RestRequest,
    actor: Actor,
    userId: string,
    method: string,
  ): Promise<RestResponse> {
    if (method !== 'POST') return methodNotAllowed(['POST'])

    // Self only, admin included: see this file's header. An admin who could set
    // another account's password could sign in as them, and every audit entry
    // afterwards would name the wrong person.
    if (actor.id !== userId) {
      throw new CogentaError({
        code: 'FORBIDDEN',
        message: 'A password can only be changed by the account that owns it.',
        hint: 'Resetting someone else’s password needs a reset flow, which this version does not have.',
      })
    }

    const body = asRecord(request.body)
    const currentPassword = stringField(body, 'currentPassword')
    const newPassword = stringField(body, 'newPassword')
    assertPasswordPolicy(newPassword)

    // Rate-limited on the same store as sign-in: this route verifies a
    // password, so it is as much of a guessing oracle as the login route is.
    await auth.rateLimit.check(`password-change:${userId}`)
    if (!(await auth.credentials.verifyPassword(userId, currentPassword))) {
      await auth.rateLimit.record(`password-change:${userId}`)
      throw new CogentaError({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'The current password is not correct.',
        hint: 'Type the password you sign in with today, not the new one.',
      })
    }
    await auth.rateLimit.clear(`password-change:${userId}`)

    await auth.credentials.setPassword(userId, newPassword)
    return jsonResponse(200, { data: { changed: true } })
  }

  async function sessionsRoute(
    actor: Actor,
    userId: string,
    sessionId: string | undefined,
    method: string,
  ): Promise<RestResponse> {
    if (sessionId === undefined) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      requireSelfOrAdmin(actor, userId, "see another account's active sessions")
      const sessions = await auth.sessions.list(userId)
      return jsonResponse(200, {
        data: sessions.map((session) => ({
          id: session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastSeenAt: session.lastSeenAt,
          label: session.label ?? null,
        })),
      })
    }

    if (method !== 'DELETE') return methodNotAllowed(['DELETE'])
    requireSelfOrAdmin(actor, userId, "revoke another account's session")

    // Checked against *this* user's sessions, not revoked by id alone: without
    // it, `DELETE /api/users/me/sessions/{anyone-elses-id}` would pass the
    // permission check on `me` and then revoke a session belonging to someone
    // else entirely.
    const sessions = await auth.sessions.list(userId)
    if (!sessions.some((session) => session.id === sessionId)) {
      throw new CogentaError({
        code: 'CONTENT_NOT_FOUND',
        message: 'No active session with that id for this account.',
        hint: 'It may already have been revoked, or expired on its own.',
      })
    }

    await auth.sessions.revoke(sessionId)
    return { status: 204, body: null, headers: {} }
  }
}
