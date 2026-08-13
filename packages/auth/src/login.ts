import { createHmac, timingSafeEqual } from 'node:crypto'
import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { createCredentialStore } from './credentials.js'
import { requiresMfa } from './mfa.js'
import { createRateLimiter } from './rate-limit.js'
import { createSessionStore } from './sessions.js'
import { verifyTotp } from './totp.js'
import type { IssuedSession, User } from './types.js'
import { createUserStore } from './users.js'

const MFA_TICKET_TTL_MS = 5 * 60 * 1000

/**
 * A short-lived proof that a password was already checked, carried between
 * the password step and the second-factor step.
 *
 * The same shape as a preview grant (`@cogenta/api`'s `previewCovers`): an
 * opaque HMAC-signed ticket rather than server-side state, so a second factor
 * cannot be completed for a user whose password step never happened — the
 * ticket is the only thing that says it did, and it cannot be forged without
 * the signing key.
 */
function signMfaTicket(key: string, userId: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt })).toString('base64url')
  const signature = createHmac('sha256', key).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyMfaTicket(key: string, ticket: string, now: number): string | null {
  const [payload, signature] = ticket.split('.')
  if (payload === undefined || signature === undefined) return null

  const expected = createHmac('sha256', key).update(payload).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const { userId, expiresAt } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      userId: string
      expiresAt: number
    }
    return expiresAt > now ? userId : null
  } catch {
    return null
  }
}

export type LoginResult =
  | { readonly status: 'session'; readonly session: IssuedSession; readonly user: User }
  | {
      readonly status: 'mfa_required'
      readonly ticket: string
      readonly availableFactors: readonly ('totp' | 'webauthn')[]
    }

export interface AuthServiceOptions {
  readonly db: DatabaseHandle
  /** From `COGENTA_AUTH_SIGNING_KEY`, never from a config file (rule R7). */
  readonly signingKey: string
  /** What decides whether a role needs a second factor (`sensitiveRoles`). */
  readonly collections: readonly CollectionDefinition[]
  readonly now?: () => number
}

export interface AuthService {
  passwordLogin(email: string, password: string): Promise<LoginResult>
  totpLogin(ticket: string, token: string): Promise<LoginResult>
  /** Issues a session directly: a verified passkey already proved a strong second factor. */
  sessionForVerifiedUser(userId: string): Promise<LoginResult>
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  const { db, signingKey, collections } = options
  const now = options.now ?? Date.now
  const users = createUserStore(db, now)
  const credentials = createCredentialStore(db, now)
  const sessions = createSessionStore(db, now)
  const rateLimit = createRateLimiter(db, now)

  async function issueSession(user: User): Promise<LoginResult> {
    const session = await sessions.create(user.id)
    return { status: 'session', session, user }
  }

  async function mfaChallenge(user: User): Promise<LoginResult> {
    const kinds = await credentials.kinds(user.id)
    const available: ('totp' | 'webauthn')[] = []
    if (kinds.includes('totp')) available.push('totp')
    if (kinds.includes('webauthn')) available.push('webauthn')

    if (available.length === 0) {
      // A role that requires MFA and a user who never set one up: refuse
      // rather than fall back to password alone, or the requirement was
      // never actually enforced.
      throw new CogentaError({
        code: 'AUTH_MFA_REQUIRED',
        message: `${user.email} holds a role that requires a second factor, but none is set up.`,
        hint: 'Set up TOTP or a passkey for this account before it can sign in — MFA cannot be bypassed for a role with publish rights.',
      })
    }

    return {
      status: 'mfa_required',
      ticket: signMfaTicket(signingKey, user.id, now() + MFA_TICKET_TTL_MS),
      availableFactors: available,
    }
  }

  return {
    passwordLogin: async (email, password) => {
      const subject = email.trim().toLowerCase()
      await rateLimit.check(subject)

      const user = await users.byEmail(subject)
      const valid = user !== null && (await credentials.verifyPassword(user.id, password))

      if (!valid || user === null || user.status !== 'active') {
        await rateLimit.record(subject)
        throw new CogentaError({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Incorrect email or password.',
          hint: 'Check the email and password. Repeated failures are rate-limited.',
        })
      }

      await rateLimit.clear(subject)
      return requiresMfa(user.roles, collections) ? mfaChallenge(user) : issueSession(user)
    },

    totpLogin: async (ticket, token) => {
      const userId = verifyMfaTicket(signingKey, ticket, now())
      if (userId === null) {
        throw new CogentaError({
          code: 'AUTH_SESSION_INVALID',
          message: 'This sign-in attempt has expired or is invalid.',
          hint: 'Start over from the password step.',
        })
      }

      await rateLimit.check(`mfa:${userId}`)
      const stored = await credentials.totpSecret(userId)
      const ok =
        stored !== null &&
        stored.verified &&
        verifyTotp(token, stored.secret, { now: Math.floor(now() / 1000) })

      if (!ok) {
        await rateLimit.record(`mfa:${userId}`)
        throw new CogentaError({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Incorrect verification code.',
          hint: 'Check the code from your authenticator app. Codes are valid for 30 seconds.',
        })
      }

      const user = await users.byId(userId)
      if (user === null) {
        throw new CogentaError({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'This account no longer exists.',
          hint: 'It may have been deleted between the password step and this one. Sign in again.',
        })
      }
      await rateLimit.clear(`mfa:${userId}`)
      return issueSession(user)
    },

    sessionForVerifiedUser: async (userId) => {
      const user = await users.byId(userId)
      if (user === null || user.status !== 'active') {
        throw new CogentaError({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'This account no longer exists or is disabled.',
        })
      }
      return issueSession(user)
    },
  }
}
