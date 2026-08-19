import { randomBytes } from 'node:crypto'
import type { AuthStore, UpdateProfileInput, User } from '@cogenta/auth'
import { requiresMfa } from '@cogenta/auth'
import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { assertPasswordPolicy } from './password-policy.js'
import { single } from './query.js'

/**
 * `/api/users` — L11 task 3's account list, grown by fiche 17 into the rest of
 * the account lifecycle: invitations, search and pagination, a self-service
 * profile, dormant/MFA signals, and anonymization.
 *
 * Two access rules, and only two, so there is nothing subtle to get wrong:
 *
 *  - **Anything about somebody else needs `admin`.** Listing accounts, creating
 *    one, changing a role, disabling one, inviting/cancelling/anonymizing one,
 *    reading or revoking another person's sessions. `requireAdmin` is called
 *    before the route body runs, never inside it (R4: the runtime checks, the
 *    operation does not).
 *  - **Your own account is yours.** Reading your profile, listing your sessions,
 *    revoking one of them, changing your own password, editing your own public
 *    profile. `me` resolves to the actor the bearer token produced, so "your
 *    own" is never something a request can claim.
 *
 * Changing *somebody else's* password is deliberately absent, still. That is a
 * password reset — an admin who could silently set another account's password
 * could sign in as them, and every audit entry afterwards would name the wrong
 * person. The self-service `/forgot-password` flow is the only reset path.
 *
 * Two more account states exist beyond `active`/`disabled`, both reached only
 * through their own dedicated routes below, never through the generic
 * `PATCH /{id}`: `invited` (created by `POST /api/users` with `invite: true`,
 * turned into `active` the moment the invitee redeems the token at
 * `POST /api/auth/reset-password`) and `anonymized` (fiche 17 task 5's
 * irreversible, RGPD-erasure terminal state — `applyUserChange` refuses every
 * further change to a row in it).
 */

export interface InvitedUserEvent {
  readonly user: User
  readonly roles: readonly string[]
  readonly token: string
  readonly expiresAt: string
}

export interface UsersRouterOptions {
  readonly auth: AuthStore
  /** Mount point. `/api/users` by default. */
  readonly basePath?: string
  /**
   * Read for the per-account "MFA recommended" signal (fiche 17 task 4) —
   * the exact same source `requiresMfa`/`sensitiveRoles` already read for the
   * profile notice. Absent (the default) means no account is ever flagged,
   * the same as a site with no collections at all.
   */
  readonly collections?: readonly CollectionDefinition[]
  /**
   * Delivers the invitation token `POST /api/users` (`invite: true`) or the
   * resend route issues, the same shape `@cogenta/api`'s `onForgotPassword`
   * already follows. **Absent is the mandatory fallback (R1)**: `POST
   * /api/users` then behaves exactly as it always has — a password generated
   * and returned once, no email involved — and the resend/cancel routes
   * refuse with `AUTH_INVITE_UNAVAILABLE` since there is never an `invited`
   * account to act on without this. `cogenta serve` wires this the same way
   * it wires `onForgotPassword`.
   */
  readonly onInvite?: (event: InvitedUserEvent) => Promise<void>
  /** Clock, overridable for tests — only the dormant-account signal (task 4) reads it. */
  readonly now?: () => number
}

export interface UsersRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/users'

/**
 * A week: long enough that a colleague checking mail once a day still finds
 * it, short enough that a stale, unaccepted invitation is not a standing
 * elevation-of-privilege door. Far longer than the 30-minute forgot-password
 * token this reuses the same primitive as — that one guards an *existing*
 * account against a guessed link, this one is waiting on a human to notice a
 * mail.
 */
const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** The threshold the "dormant" signal (fiche 17 task 4) is computed against — a forgotten door, not a strict SLA. */
const DORMANT_ACCOUNT_DAYS = 90

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

const MAX_DISPLAY_NAME_LENGTH = 120
const MAX_BIO_LENGTH = 500

/** Same shape `defineTaxonomy()` already validates a locale tag against (`@cogenta/schema`'s `define-taxonomy.ts`) — loose BCP-47, not a full grammar. */
const LOCALE_PATTERN = /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{2,8})*$/

const BULK_ACTIONS = ['disable', 'enable', 'setRoles'] as const
type BulkAction = (typeof BULK_ACTIONS)[number]

const USERS_SORT_FIELDS = ['createdAt', 'lastSignInAt'] as const
type UsersSortField = (typeof USERS_SORT_FIELDS)[number]

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

function idsField(body: Record<string, unknown>): readonly string[] {
  const value = body['ids']
  if (!Array.isArray(value) || value.length === 0) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: '"ids" must be a non-empty array of account ids.',
      hint: 'Select at least one account first.',
    })
  }
  const ids = value.map((id) => (typeof id === 'string' ? id : ''))
  if (ids.some((id) => id.length === 0)) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'Every entry in "ids" must be a non-empty string.',
      hint: 'ids are the account ids shown in the accounts list.',
    })
  }
  return ids
}

function bulkActionField(body: Record<string, unknown>): BulkAction {
  const value = body['action']
  if (typeof value === 'string' && (BULK_ACTIONS as readonly string[]).includes(value)) {
    return value as BulkAction
  }
  throw new CogentaError({
    code: 'QUERY_INVALID',
    message: `"action" must be one of: ${BULK_ACTIONS.join(', ')}.`,
    hint: 'Send one bulk action per call.',
  })
}

function booleanField(body: Record<string, unknown>, field: string, fallback: boolean): boolean {
  const value = body[field]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"${field}" must be a boolean.`,
      hint: `Send "${field}" as true or false.`,
    })
  }
  return value
}

function statusField(value: unknown): 'active' | 'disabled' {
  if (value === 'active' || value === 'disabled') return value
  throw new CogentaError({
    code: 'QUERY_INVALID',
    message: '"status" must be either "active" or "disabled".',
    hint:
      'Accounts are disabled, never deleted through this route — "invited" and ' +
      '"anonymized" are reached through their own dedicated routes.',
  })
}

/** `undefined` (field absent) means "leave alone"; present-and-string or present-and-null is a real value. */
function optionalNullableString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string | null | undefined {
  if (!(field in body)) return undefined
  const value = body[field]
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"${field}" must be a string or null.`,
      hint: `Send "${field}" as text, or null to clear it.`,
    })
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"${field}" is too long (max ${maxLength} characters).`,
      hint: 'Shorten it and try again.',
    })
  }
  return trimmed.length === 0 ? null : trimmed
}

/**
 * Self-service only (this file's header, and `UpdateProfileInput`'s own doc
 * comment) — there is no admin-editable path for another person's name, bio
 * or avatar, on purpose.
 */
function profileInputFrom(body: Record<string, unknown>): UpdateProfileInput {
  const input: { -readonly [K in keyof UpdateProfileInput]?: UpdateProfileInput[K] } = {}

  const displayName = optionalNullableString(body, 'displayName', MAX_DISPLAY_NAME_LENGTH)
  if (displayName !== undefined) input.displayName = displayName

  const bio = optionalNullableString(body, 'bio', MAX_BIO_LENGTH)
  if (bio !== undefined) input.bio = bio

  if ('avatarMediaId' in body) {
    const value = body['avatarMediaId']
    if (value !== null && typeof value !== 'string') {
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: '"avatarMediaId" must be a media id or null.',
        hint: 'Pick an image from the media library, or send null to remove it.',
      })
    }
    input.avatarMediaId = value
  }

  if ('locale' in body) {
    const value = body['locale']
    if (value !== null && (typeof value !== 'string' || !LOCALE_PATTERN.test(value))) {
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: '"locale" must be a language tag (e.g. "en", "fr-CA") or null.',
        hint: 'Send null to clear it and fall back to the admin default.',
      })
    }
    input.locale = value
  }

  return input
}

interface MfaSummary {
  readonly totp: boolean
  readonly passkeys: number
}

interface InvitationView {
  readonly sentAt: string
  readonly expiresAt: string
}

interface UserViewContext {
  readonly mfa: MfaSummary
  readonly lastSignInAt: string | null
  readonly mfaRecommended: boolean
  readonly invitation: InvitationView | null
}

/**
 * Ninety days with nobody behind the wheel, on an account that could still
 * sign in (`invited`/`anonymized` are never "dormant" — one has not had its
 * first chance yet, the other is not coming back).
 */
function isDormant(user: User, lastSignInAt: string | null, now: number): boolean {
  if (user.status !== 'active' && user.status !== 'disabled') return false
  if (lastSignInAt === null) return true
  const days = (now - new Date(lastSignInAt).getTime()) / (24 * 60 * 60 * 1000)
  return days > DORMANT_ACCOUNT_DAYS
}

/** What a user looks like on the wire, plus what second factors they hold and the signals fiche 17 task 4 adds. */
function publicUser(user: User, context: UserViewContext, now: number): unknown {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarMediaId: user.avatarMediaId,
    bio: user.bio,
    locale: user.locale,
    roles: user.roles,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    mfa: context.mfa,
    mfaRecommended: context.mfaRecommended,
    lastSignInAt: context.lastSignInAt,
    dormant: isDormant(user, context.lastSignInAt, now),
    invitation: context.invitation,
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
      'User routes are /api/users, /api/users/bulk, /api/users/{id|me}, ' +
      '/api/users/{id|me}/sessions, /api/users/{id|me}/sessions/{sessionId}, ' +
      '/api/users/me/password, /api/users/me/profile, /api/users/{id}/invite ' +
      'and /api/users/{id}/anonymize.',
  })
}

function userNotFound(): CogentaError {
  return new CogentaError({
    code: 'AUTH_USER_NOT_FOUND',
    message: 'No account with that id.',
    hint: 'It may have been created on a different site, or the id may be mistyped.',
  })
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  return 'Unknown error.'
}

function errorCode(reason: unknown): string | undefined {
  return reason instanceof CogentaError ? reason.code : undefined
}

function parsePageLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PAGE_SIZE
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"limit" must be a whole number between 1 and ${MAX_PAGE_SIZE}.`,
      hint: `Ask for between 1 and ${MAX_PAGE_SIZE} accounts.`,
    })
  }
  return parsed
}

function parseUsersSort(raw: string | undefined): {
  field: UsersSortField
  direction: 'asc' | 'desc'
} {
  if (raw === undefined) return { field: 'createdAt', direction: 'asc' }
  const [field, direction = 'asc'] = raw.split(':')
  if (!(USERS_SORT_FIELDS as readonly string[]).includes(field ?? '')) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: `"sort" names a field this route cannot order by.`,
      hint: `Sort on one of: ${USERS_SORT_FIELDS.join(', ')}, e.g. sort=lastSignInAt:desc.`,
    })
  }
  if (direction !== 'asc' && direction !== 'desc') {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: '"sort" has an unknown direction.',
      hint: 'Use sort=<field>:asc or sort=<field>:desc.',
    })
  }
  return { field: field as UsersSortField, direction }
}

interface SortedUser {
  readonly user: User
  /**
   * The comparable sort key — `createdAt` is always a real ISO timestamp;
   * `lastSignInAt` is `''` for an account that never signed in, which sorts
   * before every real timestamp lexically regardless of direction, so a
   * never-signed-in account reads first ascending and last descending — the
   * same place a `null` would land in any "oldest/most recent first" list.
   */
  readonly key: string
}

function compareSortKey(a: SortedUser, b: SortedUser, direction: 'asc' | 'desc'): number {
  const primary =
    a.key < b.key
      ? -1
      : a.key > b.key
        ? 1
        : a.user.id < b.user.id
          ? -1
          : a.user.id > b.user.id
            ? 1
            : 0
  return direction === 'asc' ? primary : -primary
}

/** Opaque only in the sense of "not a row id" — nothing here is secret, so no signature is needed, unlike a session or reset token. */
function encodeUsersCursor(key: string, id: string): string {
  return Buffer.from(`${key} ${id}`, 'utf8').toString('base64url')
}

function decodeUsersCursor(raw: string): { key: string; id: string } | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    const separator = decoded.indexOf(' ')
    if (separator === -1) return null
    return { key: decoded.slice(0, separator), id: decoded.slice(separator + 1) }
  } catch {
    return null
  }
}

export function createUsersRouter(options: UsersRouterOptions): UsersRouter {
  const { auth } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const collections = options.collections ?? []
  const now = options.now ?? Date.now

  async function mfaOf(userId: string): Promise<MfaSummary> {
    const totp = await auth.credentials.totpSecret(userId)
    const passkeys = await auth.credentials.webAuthnCredentials(userId)
    // An unconfirmed secret is not a factor — sign-in ignores it too
    // (`enrolledFactors` in `@cogenta/auth`), so reporting it as "on" here
    // would tell someone they are protected when they are not.
    return { totp: totp !== null && totp.verified, passkeys: passkeys.length }
  }

  function mfaRecommendedFor(user: User, mfa: MfaSummary): boolean {
    if (!requiresMfa(user.roles, collections)) return false
    return !mfa.totp && mfa.passkeys === 0
  }

  async function invitationFor(user: User): Promise<InvitationView | null> {
    if (user.status !== 'invited') return null
    const pending = await auth.resets.pending(user.id)
    return pending === null ? null : { sentAt: pending.issuedAt, expiresAt: pending.expiresAt }
  }

  async function viewContextFor(
    user: User,
    lastSeen?: ReadonlyMap<string, string>,
  ): Promise<UserViewContext> {
    const [mfa, resolvedLastSeen, invitation] = await Promise.all([
      mfaOf(user.id),
      lastSeen === undefined ? auth.sessions.lastSeenByUser() : Promise.resolve(lastSeen),
      invitationFor(user),
    ])
    return {
      mfa,
      lastSignInAt: resolvedLastSeen.get(user.id) ?? null,
      mfaRecommended: mfaRecommendedFor(user, mfa),
      invitation,
    }
  }

  /**
   * Refuses any change that would leave the site with no way back in.
   *
   * Demoting, disabling or anonymizing the last active admin is not a
   * permission question — the person doing it is allowed to — it is a locked
   * door with the key on the inside. There is no admin-driven password reset
   * in this product (this file's header explains why), so this is the only
   * thing standing between one careless click and a site nobody can
   * administer.
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

  /**
   * The one place that actually mutates roles/status, shared by the single
   * `PATCH` route and the bulk route below — so the anonymized guard, the
   * last-admin guard and the invitation-invalidation rule can only ever be
   * applied once, not kept in sync between two call sites.
   */
  async function applyUserChange(
    user: User,
    changes: { readonly roles?: readonly string[]; readonly status?: 'active' | 'disabled' },
  ): Promise<void> {
    if (user.status === 'anonymized') {
      throw new CogentaError({
        code: 'AUTH_ACCOUNT_ANONYMIZED',
        message: 'This account has been anonymized and can no longer be changed.',
        hint: 'Anonymization is irreversible (fiche 17) — invite a new account instead.',
      })
    }

    await assertAdminRemains(user, changes)

    if (changes.roles !== undefined) {
      await auth.users.setRoles(user.id, changes.roles)
      // The invitation is an elevation-of-privilege token (this file's
      // header). Changing what role it would grant, before it is accepted,
      // has to kill the outstanding link — accepting it must always grant
      // exactly the role the account holds *now*, never the one an admin
      // reconsidered a moment later.
      if (user.status === 'invited') await auth.resets.revokeAllFor(user.id)
    }
    if (changes.status !== undefined) {
      await auth.users.setStatus(user.id, changes.status)
      // Disabling an account that is signed in somewhere has to end those
      // sessions too. `resolveActor` already refuses a disabled user, so this
      // is belt and braces — but a revoked row is the thing an operator can
      // actually see, and "disabled" that leaves live sessions listed reads
      // like the revocation did not happen.
      if (changes.status === 'disabled') await auth.sessions.revokeAll(user.id)
    }
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
        if (segments.length === 1 && segments[0] === 'bulk') {
          return await bulkRoute(request, actor, method)
        }

        const userId = resolveUserId(segments[0] ?? '', actor)

        if (segments.length === 1) return await userRoute(request, actor, userId, method)

        if (segments[1] === 'password' && segments.length === 2) {
          return await passwordRoute(request, actor, userId, method)
        }

        if (segments[1] === 'profile' && segments.length === 2) {
          return await profileRoute(request, actor, userId, method)
        }

        if (segments[1] === 'invite' && segments.length === 2) {
          return await inviteRoute(actor, userId, method)
        }

        if (segments[1] === 'anonymize' && segments.length === 2) {
          return await anonymizeRoute(request, actor, userId, method)
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
      const q = single(request.query, 'q')
      const limit = parsePageLimit(single(request.query, 'limit'))
      const afterRaw = single(request.query, 'after')
      const sort = parseUsersSort(single(request.query, 'sort'))

      const all = await auth.users.list()
      const byRole = role === undefined ? all : all.filter((user) => user.roles.includes(role))
      // No dedicated index for accounts either: a substring match on email or
      // display name, in memory, over the same list this route already loads
      // in full — fiche 17 task 2.
      const needle = q === undefined ? undefined : q.trim().toLowerCase()
      const filtered =
        needle === undefined || needle.length === 0
          ? byRole
          : byRole.filter(
              (user) =>
                user.email.toLowerCase().includes(needle) ||
                (user.displayName ?? '').toLowerCase().includes(needle),
            )

      const lastSeen = await auth.sessions.lastSeenByUser()
      const keyed: SortedUser[] = filtered.map((user) => ({
        user,
        key: sort.field === 'createdAt' ? user.createdAt : (lastSeen.get(user.id) ?? ''),
      }))
      keyed.sort((a, b) => compareSortKey(a, b, sort.direction))

      let startIndex = 0
      if (afterRaw !== undefined) {
        const cursor = decodeUsersCursor(afterRaw)
        const foundIndex =
          cursor === null
            ? -1
            : keyed.findIndex((item) => item.key === cursor.key && item.user.id === cursor.id)
        // An unknown or stale cursor (the account it pointed at was removed,
        // or a filter changed) falls back to page 1 rather than erroring —
        // this is a listing screen, not a security boundary.
        if (foundIndex !== -1) startIndex = foundIndex + 1
      }

      const page = keyed.slice(startIndex, startIndex + limit)
      const hasMore = startIndex + limit < keyed.length
      const lastOfPage = page[page.length - 1]
      const nextCursor =
        hasMore && lastOfPage !== undefined
          ? encodeUsersCursor(lastOfPage.key, lastOfPage.user.id)
          : null

      const withView = await Promise.all(
        page.map(async (item) =>
          publicUser(item.user, await viewContextFor(item.user, lastSeen), now()),
        ),
      )

      return jsonResponse(200, {
        data: withView,
        page: { hasMore, nextCursor },
        // Tells the admin up front whether "invite by email" is even on offer
        // (fiche 17 task 1's mandatory R1 fallback) — driven by whether this
        // router was wired with `onInvite`, never guessed at on the client.
        meta: { invitationEmailAvailable: options.onInvite !== undefined },
      })
    }

    if (method === 'POST') {
      requireAdmin(actor, 'create an account')
      const body = asRecord(request.body)
      const email = stringField(body, 'email')
      const roles = rolesField(body, 'roles')
      const invite = booleanField(body, 'invite', false)

      if (invite && options.onInvite !== undefined) {
        const user = await auth.users.create({ email, roles, status: 'invited' })
        const issued = await auth.resets.issue(user.id, { ttlMs: INVITATION_TOKEN_TTL_MS })
        await options.onInvite({ user, roles, token: issued.token, expiresAt: issued.expiresAt })

        return jsonResponse(201, {
          data: {
            user: publicUser(user, await viewContextFor(user), now()),
            invited: true,
            emailSent: true,
          },
        })
      }

      // The mandatory fallback (R1, "aucune dépendance dure à une
      // infrastructure"): either nobody asked for an invitation, or this site
      // has no email transport wired at all. Either way the account still
      // has to be usable today — the same generated-password behaviour this
      // route has always had, byte for byte.
      const password = generatePassword()
      const user = await auth.users.create({ email, roles })
      await auth.credentials.setPassword(user.id, password)

      return jsonResponse(201, {
        data: {
          user: publicUser(user, await viewContextFor(user), now()),
          invited: false,
          emailSent: false,
          password,
        },
      })
    }

    return methodNotAllowed(['GET', 'POST'])
  }

  /** `POST /api/users/bulk` (fiche 17 task 2): act on several accounts at once, never partly silently. */
  async function bulkRoute(
    request: RestRequest,
    actor: Actor,
    method: string,
  ): Promise<RestResponse> {
    if (method !== 'POST') return methodNotAllowed(['POST'])
    requireAdmin(actor, 'act on more than one account at once')

    const body = asRecord(request.body)
    const ids = idsField(body)
    const action = bulkActionField(body)
    // Read once, outside the per-id loop: `rolesField` is a validation
    // failure for the whole call, not a per-account one — a caller who sent
    // no roles at all should not get ninety-nine successes and one strange
    // one-off failure naming the last id.
    const changes: { readonly roles?: readonly string[]; readonly status?: 'active' | 'disabled' } =
      action === 'setRoles'
        ? { roles: rolesField(body, 'roles') }
        : { status: action === 'disable' ? 'disabled' : 'active' }

    // `Promise.allSettled`, not `Promise.all`: one account rejecting (the
    // last admin, an anonymized row, an id nobody recognises) must never
    // undo — or block — what already succeeded for the others. The report
    // names every failure instead of the caller finding out by re-reading
    // the list afterwards.
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const user = await auth.users.byId(id)
        if (user === null) throw userNotFound()
        await applyUserChange(user, changes)
        return id
      }),
    )

    const succeeded: string[] = []
    const failed: { id: string; error: string; code: string | undefined }[] = []
    results.forEach((result, index) => {
      const id = ids[index] as string
      if (result.status === 'fulfilled') succeeded.push(result.value)
      else failed.push({ id, error: errorMessage(result.reason), code: errorCode(result.reason) })
    })

    return jsonResponse(200, { data: { succeeded, failed } })
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
      return jsonResponse(200, { data: publicUser(user, await viewContextFor(user), now()) })
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

      await applyUserChange(user, {
        ...(roles === undefined ? {} : { roles }),
        ...(status === undefined ? {} : { status }),
      })

      const updated = await auth.users.byId(userId)
      if (updated === null) throw userNotFound()
      return jsonResponse(200, { data: publicUser(updated, await viewContextFor(updated), now()) })
    }

    return methodNotAllowed(['GET', 'PATCH'])
  }

  /** `PATCH /api/users/me/profile` (fiche 17 task 3) — self-only, same rule as `/me/password`'s. */
  async function profileRoute(
    request: RestRequest,
    actor: Actor,
    userId: string,
    method: string,
  ): Promise<RestResponse> {
    if (method !== 'PATCH') return methodNotAllowed(['PATCH'])

    if (actor.id !== userId) {
      throw new CogentaError({
        code: 'FORBIDDEN',
        message: 'A profile can only be changed by the account it belongs to.',
        hint: 'There is no admin-editable path for someone else’s name, bio or avatar.',
      })
    }

    const user = await auth.users.byId(userId)
    if (user === null) throw userNotFound()

    const input = profileInputFrom(asRecord(request.body))
    await auth.users.updateProfile(userId, input)

    const updated = await auth.users.byId(userId)
    if (updated === null) throw userNotFound()
    return jsonResponse(200, { data: publicUser(updated, await viewContextFor(updated), now()) })
  }

  /** `POST`/`DELETE /api/users/{id}/invite` (fiche 17 task 1) — resend and cancel. */
  async function inviteRoute(actor: Actor, userId: string, method: string): Promise<RestResponse> {
    requireAdmin(actor, 'manage an invitation')
    const user = await auth.users.byId(userId)
    if (user === null) throw userNotFound()

    if (user.status !== 'invited') {
      throw new CogentaError({
        code: 'AUTH_INVITE_INVALID_STATE',
        message: 'This account is not a pending invitation.',
        hint: 'Only an account still in the "invited" status can be resent or cancelled.',
      })
    }

    if (method === 'POST') {
      if (options.onInvite === undefined) {
        throw new CogentaError({
          code: 'AUTH_INVITE_UNAVAILABLE',
          message: 'No email transport is configured on this site.',
          hint:
            'This invitation could not have been created without one — check the ' +
            'site’s configuration.',
        })
      }
      const issued = await auth.resets.issue(user.id, { ttlMs: INVITATION_TOKEN_TTL_MS })
      await options.onInvite({
        user,
        roles: user.roles,
        token: issued.token,
        expiresAt: issued.expiresAt,
      })
      return jsonResponse(200, { data: { invited: true, expiresAt: issued.expiresAt } })
    }

    if (method === 'DELETE') {
      await auth.resets.revokeAllFor(user.id)
      // Safe as a real, hard delete — see `UserStore.delete`'s doc comment:
      // an `invited` account can never have signed in, so there is nothing
      // for the audit log or a `createdBy` column to lose.
      await auth.users.delete(user.id)
      return { status: 204, body: null, headers: {} }
    }

    return methodNotAllowed(['POST', 'DELETE'])
  }

  /** `POST /api/users/{id}/anonymize` (fiche 17 task 5) — irreversible, confirmed by typing the email. */
  async function anonymizeRoute(
    request: RestRequest,
    actor: Actor,
    userId: string,
    method: string,
  ): Promise<RestResponse> {
    if (method !== 'POST') return methodNotAllowed(['POST'])
    requireAdmin(actor, 'anonymize an account')

    const user = await auth.users.byId(userId)
    if (user === null) throw userNotFound()

    if (user.status === 'anonymized') {
      throw new CogentaError({
        code: 'AUTH_ACCOUNT_ANONYMIZED',
        message: 'This account has already been anonymized.',
        hint: 'Anonymization only happens once — there is nothing left to change.',
      })
    }

    const body = asRecord(request.body)
    const confirmEmail = stringField(body, 'confirmEmail')
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new CogentaError({
        code: 'AUTH_ANONYMIZE_CONFIRMATION_MISMATCH',
        message: 'The typed email does not match this account’s current address.',
        hint: 'Type the account’s exact email address to confirm — this cannot be undone.',
      })
    }

    // Same lockout guard a status change gets: anonymizing removes the
    // account from `active` just as surely as disabling it does.
    await assertAdminRemains(user, { status: 'disabled' })

    const anonymized = await auth.users.anonymize(user.id)
    await auth.sessions.revokeAll(user.id)
    await auth.resets.revokeAllFor(user.id)

    // The one user-lifecycle action this file writes to the audit log
    // (nothing else here does, today — see the report this fiche shipped
    // with for why that is a deliberate, narrow scope rather than an
    // oversight). The diff deliberately does not carry the erased email:
    // writing it here would undo the erasure this action exists to perform.
    await auth.audit.record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action: 'user.anonymize',
      entryId: user.id,
      diff: { anonymized: true },
    })

    return jsonResponse(200, { data: { id: anonymized.id, anonymized: true } })
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
