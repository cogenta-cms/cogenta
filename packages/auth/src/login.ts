import { createHmac, timingSafeEqual } from 'node:crypto'
import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { createCredentialStore } from './credentials.js'
import { requiresMfa } from './mfa.js'
import { createRateLimiter } from './rate-limit.js'
import { createSessionStore } from './sessions.js'
import { generateTotpSecret, totpUri, verifyTotp } from './totp.js'
import type { IssuedSession, User } from './types.js'
import { createUserStore } from './users.js'

const TICKET_TTL_MS = 5 * 60 * 1000

type TicketPurpose = 'login' | 'totp_setup'

/**
 * A short-lived proof that a password was already checked, carried between
 * the password step and whatever comes next.
 *
 * The same shape as a preview grant (`@cogenta/api`'s `previewCovers`): an
 * opaque HMAC-signed ticket rather than server-side state, so the next step
 * cannot be completed for a user whose password step never happened — the
 * ticket is the only thing that says it did, and it cannot be forged without
 * the signing key.
 *
 * `purpose` is part of what gets signed, not a separate check layered on
 * top: a login ticket and a first-time TOTP-setup ticket must not be
 * interchangeable, and folding the purpose into the signature is what makes
 * swapping one for the other a signature mismatch rather than a bug to
 * remember not to introduce.
 */
function signTicket(
  key: string,
  purpose: TicketPurpose,
  userId: string,
  expiresAt: number,
): string {
  const payload = Buffer.from(JSON.stringify({ purpose, userId, expiresAt })).toString('base64url')
  const signature = createHmac('sha256', key).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyTicket(
  key: string,
  purpose: TicketPurpose,
  ticket: string,
  now: number,
): string | null {
  const [payload, signature] = ticket.split('.')
  if (payload === undefined || signature === undefined) return null

  const expected = createHmac('sha256', key).update(payload).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      purpose: unknown
      userId: unknown
      expiresAt: unknown
    }
    if (parsed.purpose !== purpose) return null
    if (typeof parsed.userId !== 'string' || typeof parsed.expiresAt !== 'number') return null
    return parsed.expiresAt > now ? parsed.userId : null
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
  | {
      /**
       * A sensitive role with no second factor set up yet. Not an error: the
       * password was correct, and the only thing standing between this
       * attempt and a session is enrolling TOTP right now, with the ticket
       * this result carries.
       */
      readonly status: 'totp_setup_required'
      readonly ticket: string
    }

export interface TotpSetup {
  readonly secret: string
  /** `otpauth://` URI, for a QR code the authenticator app scans. */
  readonly uri: string
}

export interface AuthServiceOptions {
  readonly db: DatabaseHandle
  /** From `COGENTA_AUTH_SIGNING_KEY`, never from a config file (rule R7). */
  readonly signingKey: string
  /** What decides whether a role needs a second factor (`sensitiveRoles`). */
  readonly collections: readonly CollectionDefinition[]
  /** Shown in the authenticator app next to the account name. Defaults to "Cogenta". */
  readonly issuer?: string
  readonly now?: () => number
}

export interface AuthService {
  passwordLogin(email: string, password: string): Promise<LoginResult>
  totpLogin(ticket: string, token: string): Promise<LoginResult>
  /** Issues a session directly: a verified passkey already proved a strong second factor. */
  sessionForVerifiedUser(userId: string): Promise<LoginResult>
  /** Generates a fresh TOTP secret for a `totp_setup_required` ticket and stores it, unconfirmed. */
  beginTotpSetup(ticket: string): Promise<TotpSetup>
  /** Confirms the code from the authenticator app and, on success, signs the user in. */
  confirmTotpSetup(ticket: string, token: string): Promise<LoginResult>
}

function invalidTicket(): CogentaError {
  return new CogentaError({
    code: 'AUTH_SESSION_INVALID',
    message: 'This sign-in attempt has expired or is invalid.',
    hint: 'Start over from the password step.',
  })
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  const { db, signingKey, collections } = options
  const issuer = options.issuer ?? 'Cogenta'
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
      // A role that requires MFA and a user who never set one up: this is
      // the one place that enrolment can start, with a ticket scoped to
      // exactly that — it proves the password step happened, and nothing
      // more, the same as the ordinary MFA ticket proves the same thing for
      // completing a second factor that already exists.
      return {
        status: 'totp_setup_required',
        ticket: signTicket(signingKey, 'totp_setup', user.id, now() + TICKET_TTL_MS),
      }
    }

    return {
      status: 'mfa_required',
      ticket: signTicket(signingKey, 'login', user.id, now() + TICKET_TTL_MS),
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
      const userId = verifyTicket(signingKey, 'login', ticket, now())
      if (userId === null) throw invalidTicket()

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

    beginTotpSetup: async (ticket) => {
      const userId = verifyTicket(signingKey, 'totp_setup', ticket, now())
      if (userId === null) throw invalidTicket()

      const user = await users.byId(userId)
      if (user === null) {
        throw new CogentaError({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'This account no longer exists.',
          hint: 'It may have been deleted between the password step and this one. Sign in again.',
        })
      }

      // A fresh secret every time this is called, even for the same ticket:
      // requesting the QR code again (a slow scan, a wrong app) must not
      // let two different secrets both end up "current" — only the last one
      // requested can ever be confirmed.
      const secret = generateTotpSecret()
      await credentials.setTotpSecret(user.id, secret)
      return { secret, uri: totpUri(secret, issuer, user.email) }
    },

    confirmTotpSetup: async (ticket, token) => {
      const userId = verifyTicket(signingKey, 'totp_setup', ticket, now())
      if (userId === null) throw invalidTicket()

      await rateLimit.check(`totp-setup:${userId}`)
      const stored = await credentials.totpSecret(userId)
      const ok =
        stored !== null && verifyTotp(token, stored.secret, { now: Math.floor(now() / 1000) })

      if (!ok) {
        await rateLimit.record(`totp-setup:${userId}`)
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
          hint: 'It may have been deleted since the password step. Sign in again.',
        })
      }
      await rateLimit.clear(`totp-setup:${userId}`)
      await credentials.confirmTotp(userId)
      return issueSession(user)
    },
  }
}
