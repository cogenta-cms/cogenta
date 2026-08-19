import { createHmac, timingSafeEqual } from 'node:crypto'
import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { createCredentialStore } from './credentials.js'
import { createRateLimiter } from './rate-limit.js'
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes.js'
import { createSessionStore } from './sessions.js'
import { generateTotpSecret, totpUri, verifyTotp } from './totp.js'
import type { IssuedSession, User } from './types.js'
import { createUserStore } from './users.js'
import {
  beginWebAuthnAuthentication,
  beginWebAuthnRegistration,
  completeWebAuthnAuthentication,
  completeWebAuthnRegistration,
  type WebAuthnConfig,
} from './webauthn.js'

const TICKET_TTL_MS = 5 * 60 * 1000

type TicketPurpose = 'login' | 'webauthn_register' | 'webauthn_login'

interface TicketPayload {
  readonly purpose: TicketPurpose
  /** `null` for `webauthn_login`: which account this is has not been decided yet — the assertion decides it. */
  readonly userId: string | null
  /** Present only for the two WebAuthn purposes — the challenge the ceremony must be answered against. */
  readonly challenge?: string
  readonly expiresAt: number
  /**
   * Carries a "remember me" choice from the password step across to whichever
   * step actually issues the session (fiche 18 task 5) — a login ticket is the
   * only thing both steps share, since no session exists yet to hold it in.
   */
  readonly ttlMs?: number
}

interface VerifiedTicket {
  readonly userId: string | null
  readonly challenge: string | undefined
  readonly ttlMs: number | undefined
}

/**
 * A short-lived proof that a previous step already happened, carried between
 * that step and whatever completes it.
 *
 * The same shape as a preview grant (`@cogenta/api`'s `previewCovers`): an
 * opaque HMAC-signed ticket rather than server-side state, so the next step
 * cannot be completed for a user (or a ceremony) whose earlier step never
 * happened — the ticket is the only thing that says it did, and it cannot be
 * forged without the signing key. A WebAuthn challenge rides in the same
 * ticket rather than a separate store: `webauthn.ts`'s own doc says challenge
 * storage is deliberately this layer's job, not a database table for
 * something single-use that lives seconds.
 *
 * `purpose` is part of what gets signed, not a separate check layered on
 * top: a login ticket and a WebAuthn registration ticket (or a WebAuthn
 * registration ticket and a WebAuthn login ticket) must not be
 * interchangeable, and folding the purpose into the signature is what makes
 * swapping one for another a signature mismatch rather than a bug to
 * remember not to introduce.
 */
function signTicket(key: string, payload: TicketPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', key).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

function verifyTicket(
  key: string,
  purpose: TicketPurpose,
  ticket: string,
  now: number,
): VerifiedTicket | null {
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
      challenge: unknown
      expiresAt: unknown
      ttlMs: unknown
    }
    if (parsed.purpose !== purpose) return null
    if (parsed.userId !== null && typeof parsed.userId !== 'string') return null
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) return null
    if (parsed.challenge !== undefined && typeof parsed.challenge !== 'string') return null
    if (parsed.ttlMs !== undefined && typeof parsed.ttlMs !== 'number') return null
    return { userId: parsed.userId, challenge: parsed.challenge, ttlMs: parsed.ttlMs }
  } catch {
    return null
  }
}

/**
 * Two outcomes, not three.
 *
 * There used to be a third, `totp_setup_required`: a sensitive role with no
 * second factor was refused a session and handed a ticket to enrol one on the
 * spot. ADR-0021 removed it. MFA is now something an account turns on from its
 * own profile and the site *recommends* through a persistent admin notice —
 * never something that stands between a correct password and a session.
 */
export type LoginResult =
  | { readonly status: 'session'; readonly session: IssuedSession; readonly user: User }
  | {
      readonly status: 'mfa_required'
      readonly ticket: string
      readonly availableFactors: readonly ('totp' | 'webauthn')[]
    }

export interface TotpSetup {
  readonly secret: string
  /** `otpauth://` URI, for a QR code the authenticator app scans. */
  readonly uri: string
}

/**
 * What confirming TOTP enrolment (or a later regeneration) hands back —
 * fiche 18 task 1. `codes` is shown to the person **exactly once**: it is
 * never returned again by any other call, and only its hash is kept.
 */
export interface RecoveryCodesIssued {
  readonly codes: readonly string[]
}

/**
 * What a caller resolved about the request making a sign-in call — fiche 18
 * tasks 2 and 5. Optional everywhere: a caller that passes nothing gets
 * exactly today's behaviour (no metadata, the default sliding session).
 */
export interface LoginContext {
  /**
   * Raw `User-Agent` header, if any. Distilled to a browser family and a
   * device type at the point of writing (`sessions.ts`) and never stored
   * whole — see that file's own comment.
   */
  readonly userAgent?: string
  /**
   * Requested session lifetime in milliseconds. Absent means the default
   * 30-day sliding window; "remember me" being left unchecked is what asks
   * for a shorter one (fiche 18 task 5). Chosen at the password step and
   * carried inside the MFA ticket to whichever step actually issues the
   * session, since no session exists yet to hold it in.
   */
  readonly ttlMs?: number
}

export interface WebAuthnRegistrationChallenge {
  readonly options: PublicKeyCredentialCreationOptionsJSON
  readonly ticket: string
}

export interface WebAuthnAuthenticationChallenge {
  readonly options: PublicKeyCredentialRequestOptionsJSON
  readonly ticket: string
}

export interface AuthServiceOptions {
  readonly db: DatabaseHandle
  /** From `COGENTA_AUTH_SIGNING_KEY`, never from a config file (rule R7). */
  readonly signingKey: string
  /**
   * Kept for the shape `createAuthStore` already passes and for what callers
   * build on top of it, not read by sign-in any more: since ADR-0021 the
   * second-factor challenge follows what a person actually enrolled, not what
   * their role is. `sensitiveRoles`/`requiresMfa` still read collections — for
   * the recommendation, not for the gate.
   */
  readonly collections: readonly CollectionDefinition[]
  /** Shown in the authenticator app next to the account name. Defaults to "Cogenta". */
  readonly issuer?: string
  /** Absent means passkeys are off: registration and login both refuse with a clear reason. */
  readonly webauthn?: WebAuthnConfig
  readonly now?: () => number
}

export interface AuthService {
  passwordLogin(email: string, password: string, context?: LoginContext): Promise<LoginResult>
  totpLogin(
    ticket: string,
    token: string,
    context?: Pick<LoginContext, 'userAgent'>,
  ): Promise<LoginResult>
  /**
   * Completes a sign-in with a recovery code instead of a TOTP code —
   * fiche 18 task 1, the way back in for an account that lost the
   * authenticator that would have produced one. The code is consumed
   * atomically: a second attempt with the same code, even seconds later,
   * fails exactly like a code that was never issued.
   */
  recoveryCodeLogin(
    ticket: string,
    code: string,
    context?: Pick<LoginContext, 'userAgent'>,
  ): Promise<LoginResult>
  /** Issues a session directly: a verified passkey already proved a strong second factor. */
  sessionForVerifiedUser(userId: string): Promise<LoginResult>
  /**
   * Generates a fresh TOTP secret for an already-signed-in account and stores
   * it, unconfirmed. `userId` comes from the caller's session, never from the
   * request body — this is self-service, so the only account it can ever touch
   * is the one making the call.
   */
  beginTotpEnrolment(userId: string): Promise<TotpSetup>
  /**
   * Confirms the code from the authenticator app, which is what makes the
   * factor real — and, in the same step, issues ten recovery codes (fiche 18
   * task 1). TOTP without recovery codes is a lock with one key: losing the
   * authenticator becomes a permanent lockout the moment this returns, so the
   * two are minted together rather than as a second, skippable step.
   */
  confirmTotpEnrolment(userId: string, token: string): Promise<RecoveryCodesIssued>
  /**
   * Turns TOTP back off. No second proof is asked for: the caller already
   * holds a live session for this account, which — if TOTP was on — they could
   * only have obtained by passing it. Recovery codes go with it: they exist
   * to be a spare key for TOTP, and there is nothing left for them to unlock
   * once it is off.
   */
  disableTotp(userId: string): Promise<void>
  /**
   * Replaces this account's recovery codes with a fresh batch, invalidating
   * every code from the previous one (fiche 18 task 1). Requires a confirmed
   * TOTP factor — a recovery code with nothing to recover from is not a
   * feature.
   */
  regenerateRecoveryCodes(userId: string): Promise<RecoveryCodesIssued>
  /** How many recovery codes remain unused, for the profile screen's counter. `{ total: 0, remaining: 0 }` if none were ever issued. */
  recoveryCodesStatus(
    userId: string,
  ): Promise<{ readonly total: number; readonly remaining: number }>
  /** Adding a passkey to an already-identified account — `userId` comes from an existing session. */
  beginWebAuthnRegistration(userId: string): Promise<WebAuthnRegistrationChallenge>
  completeWebAuthnRegistration(
    ticket: string,
    response: RegistrationResponseJSON,
    label?: string,
  ): Promise<void>
  /** Usernameless: no account is named up front, so any resident passkey the browser offers can answer. */
  beginWebAuthnLogin(): Promise<WebAuthnAuthenticationChallenge>
  completeWebAuthnLogin(
    ticket: string,
    response: AuthenticationResponseJSON,
    context?: Pick<LoginContext, 'userAgent'>,
  ): Promise<LoginResult>
}

function invalidTicket(): CogentaError {
  return new CogentaError({
    code: 'AUTH_SESSION_INVALID',
    message: 'This sign-in attempt has expired or is invalid.',
    hint: 'Start over from the password step.',
  })
}

function webauthnNotConfigured(): CogentaError {
  return new CogentaError({
    code: 'AUTH_WEBAUTHN_FAILED',
    message: 'Passkeys are not configured for this site.',
    hint: 'Set relyingPartyName, relyingPartyId and origin when creating the auth service.',
  })
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  // `options.collections` is deliberately not read here any more: since
  // ADR-0021 the second-factor challenge follows what a person enrolled, not
  // what their role is. It stays on the options type because `createAuthStore`
  // passes it and the recommendation source still needs the same list.
  const { db, signingKey, webauthn: webauthnConfig } = options
  const issuer = options.issuer ?? 'Cogenta'
  const now = options.now ?? Date.now
  const users = createUserStore(db, now)
  const credentials = createCredentialStore(db, now)
  const sessions = createSessionStore(db, now)
  const rateLimit = createRateLimiter(db, now)

  async function issueSession(
    user: User,
    context?: Pick<LoginContext, 'userAgent'> & { readonly ttlMs?: number },
  ): Promise<LoginResult> {
    const session = await sessions.create(user.id, {
      ...(context?.userAgent === undefined ? {} : { userAgent: context.userAgent }),
      ...(context?.ttlMs === undefined ? {} : { ttlMs: context.ttlMs }),
    })
    return { status: 'session', session, user }
  }

  /**
   * Builds the `issueSession` context for a step completing an MFA ticket: the
   * `userAgent` this HTTP request carried, plus the `ttlMs` "remember me"
   * chose at the password step and which rode inside the ticket ever since.
   * `exactOptionalPropertyTypes` means an explicit `undefined` is not the same
   * as an absent key, so each part is added only when it actually has a value.
   */
  function sessionContextFrom(
    context: Pick<LoginContext, 'userAgent'> | undefined,
    ttlMs: number | undefined,
  ): Pick<LoginContext, 'userAgent'> & { readonly ttlMs?: number } {
    return {
      ...(context?.userAgent === undefined ? {} : { userAgent: context.userAgent }),
      ...(ttlMs === undefined ? {} : { ttlMs }),
    }
  }

  /** Ten fresh codes, hashed and stored, replacing any still outstanding. */
  async function issueRecoveryCodes(userId: string): Promise<RecoveryCodesIssued> {
    const codes = generateRecoveryCodes()
    const hashes = await Promise.all(codes.map((code) => hashRecoveryCode(code)))
    await credentials.setRecoveryCodes(userId, hashes)
    return { codes }
  }

  /**
   * The second factors this account has actually finished setting up.
   *
   * A TOTP secret only counts once it has been confirmed. An unconfirmed one
   * means someone opened the enrolment screen and walked away; treating that as
   * a usable factor would challenge them for a code their authenticator app
   * never received, and there would be no way back.
   */
  async function enrolledFactors(userId: string): Promise<('totp' | 'webauthn')[]> {
    const available: ('totp' | 'webauthn')[] = []
    const totp = await credentials.totpSecret(userId)
    if (totp !== null && totp.verified) available.push('totp')
    if ((await credentials.webAuthnCredentials(userId)).length > 0) available.push('webauthn')
    return available
  }

  function mfaChallenge(
    user: User,
    available: readonly ('totp' | 'webauthn')[],
    ttlMs: number | undefined,
  ): LoginResult {
    return {
      status: 'mfa_required',
      ticket: signTicket(signingKey, {
        purpose: 'login',
        userId: user.id,
        expiresAt: now() + TICKET_TTL_MS,
        ...(ttlMs === undefined ? {} : { ttlMs }),
      }),
      availableFactors: available,
    }
  }

  return {
    passwordLogin: async (email, password, context) => {
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
      // What decides the challenge is what this person enrolled, not what
      // their role is (ADR-0021). A brand-new admin signs straight in; an
      // account that turned TOTP on still has to produce a code, because
      // ignoring a factor someone deliberately enabled would be a silent
      // downgrade of their own security.
      const factors = await enrolledFactors(user.id)
      return factors.length === 0
        ? issueSession(user, context)
        : mfaChallenge(user, factors, context?.ttlMs)
    },

    totpLogin: async (ticket, token, context) => {
      const verified = verifyTicket(signingKey, 'login', ticket, now())
      if (verified === null || verified.userId === null) throw invalidTicket()
      const userId = verified.userId

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
      return issueSession(user, sessionContextFrom(context, verified.ttlMs))
    },

    recoveryCodeLogin: async (ticket, code, context) => {
      const verified = verifyTicket(signingKey, 'login', ticket, now())
      if (verified === null || verified.userId === null) throw invalidTicket()
      const userId = verified.userId

      // Its own rate-limit subject, independent of `mfa:` (the TOTP guess
      // counter) and `totp-setup:` — a wrong code here is a different event
      // from a wrong 6-digit code, and neither should give the other a free
      // pass on attempts.
      await rateLimit.check(`recovery:${userId}`)
      const consumed = await credentials.consumeRecoveryCode(userId, code)

      if (!consumed) {
        await rateLimit.record(`recovery:${userId}`)
        throw new CogentaError({
          code: 'AUTH_RECOVERY_CODE_INVALID',
          message: 'This recovery code is not valid.',
          hint: 'Check you typed it exactly as it was shown, dashes included. Each code works once.',
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
      await rateLimit.clear(`recovery:${userId}`)
      return issueSession(user, sessionContextFrom(context, verified.ttlMs))
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

    beginTotpEnrolment: async (userId) => {
      const user = await users.byId(userId)
      if (user === null || user.status !== 'active') {
        throw new CogentaError({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'This account no longer exists or is disabled.',
          hint: 'Sign in again.',
        })
      }

      // A fresh secret on every call: asking for the QR code again (a slow
      // scan, the wrong app) must not leave two different secrets both
      // plausibly "current" — only the last one requested can be confirmed.
      const secret = generateTotpSecret()
      await credentials.setTotpSecret(user.id, secret)
      return { secret, uri: totpUri(secret, issuer, user.email) }
    },

    confirmTotpEnrolment: async (userId, token) => {
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

      await rateLimit.clear(`totp-setup:${userId}`)
      await credentials.confirmTotp(userId)
      // Minted in the same step, not a follow-up the person could skip: TOTP
      // with no recovery codes is a lock with exactly one key, and losing the
      // authenticator would be a permanent lockout the moment this returns.
      return issueRecoveryCodes(userId)
    },

    disableTotp: async (userId) => {
      await credentials.removeTotp(userId)
      // Nothing left for them to be a spare key for once TOTP itself is off.
      await credentials.removeRecoveryCodes(userId)
    },

    regenerateRecoveryCodes: async (userId) => {
      const totp = await credentials.totpSecret(userId)
      if (totp === null || !totp.verified) {
        throw new CogentaError({
          code: 'AUTH_RECOVERY_CODES_UNAVAILABLE',
          message: 'Recovery codes exist to get back in when two-step verification is unusable.',
          hint: 'Turn on two-step verification first — recovery codes are issued the moment it is confirmed.',
        })
      }
      return issueRecoveryCodes(userId)
    },

    recoveryCodesStatus: async (userId) => {
      const status = await credentials.recoveryCodesStatus(userId)
      return status ?? { total: 0, remaining: 0 }
    },

    beginWebAuthnRegistration: async (userId) => {
      if (webauthnConfig === undefined) throw webauthnNotConfigured()
      const user = await users.byId(userId)
      if (user === null) {
        throw new CogentaError({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'This account no longer exists.',
        })
      }

      const existing = await credentials.webAuthnCredentials(userId)
      const { options, challenge } = await beginWebAuthnRegistration(
        webauthnConfig,
        userId,
        user.email,
        existing,
      )
      return {
        options,
        ticket: signTicket(signingKey, {
          purpose: 'webauthn_register',
          userId,
          challenge,
          expiresAt: now() + TICKET_TTL_MS,
        }),
      }
    },

    completeWebAuthnRegistration: async (ticket, response, label) => {
      if (webauthnConfig === undefined) throw webauthnNotConfigured()
      const verified = verifyTicket(signingKey, 'webauthn_register', ticket, now())
      if (verified === null || verified.userId === null || verified.challenge === undefined) {
        throw invalidTicket()
      }

      const credential = await completeWebAuthnRegistration(
        webauthnConfig,
        response,
        verified.challenge,
        label,
      )
      await credentials.addWebAuthnCredential(verified.userId, credential)
    },

    beginWebAuthnLogin: async () => {
      if (webauthnConfig === undefined) throw webauthnNotConfigured()
      // No `allowCredentials`: this is the discoverable-credential (resident
      // key) flow — the browser prompts for whichever passkey it holds for
      // this site, and the assertion's own credential id says which account
      // it is, rather than the server naming one up front.
      const { options, challenge } = await beginWebAuthnAuthentication(webauthnConfig, [])
      return {
        options,
        ticket: signTicket(signingKey, {
          purpose: 'webauthn_login',
          userId: null,
          challenge,
          expiresAt: now() + TICKET_TTL_MS,
        }),
      }
    },

    completeWebAuthnLogin: async (ticket, response, context) => {
      if (webauthnConfig === undefined) throw webauthnNotConfigured()
      const verified = verifyTicket(signingKey, 'webauthn_login', ticket, now())
      if (verified === null || verified.challenge === undefined) throw invalidTicket()

      const found = await credentials.webAuthnCredentialByExternalId(response.id)
      if (found === null) {
        throw new CogentaError({
          code: 'AUTH_WEBAUTHN_FAILED',
          message: 'This passkey is not registered with any account.',
          hint: 'Register it first from an already-signed-in session, or use a different sign-in method.',
        })
      }

      const result = await completeWebAuthnAuthentication(
        webauthnConfig,
        response,
        verified.challenge,
        found.data,
      )
      await credentials.updateWebAuthnCounter(found.data.credentialId, result.newCounter)

      const user = await users.byId(found.userId)
      if (user === null || user.status !== 'active') {
        throw new CogentaError({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'This account no longer exists or is disabled.',
        })
      }
      return issueSession(user, context)
    },
  }
}
