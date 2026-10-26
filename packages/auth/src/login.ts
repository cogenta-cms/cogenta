import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { CogentaError, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { createCredentialStore } from './credentials.js'
import { hashPassword, verifyPassword } from './password.js'
import { createRateLimiter } from './rate-limit.js'
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes.js'
import { createSessionStore } from './sessions.js'
import { TABLES } from './tables.js'
import { generateTotpSecret, matchTotpStep, totpUri } from './totp.js'
import type { IssuedSession, Session, User } from './types.js'
import { createUserStore } from './users.js'
import {
  beginWebAuthnAuthentication,
  beginWebAuthnRegistration,
  completeWebAuthnAuthentication,
  completeWebAuthnRegistration,
  type WebAuthnConfig,
} from './webauthn.js'

const TICKET_TTL_MS = 5 * 60 * 1000

/** How long a started TOTP enrolment waits for its first code before it is discarded. */
const PENDING_TOTP_TTL_MS = 10 * 60 * 1000

/** How long a successful step-up lets a session change or remove a second factor. */
export const STEP_UP_TTL_MS = 5 * 60 * 1000

type TicketPurpose = 'login' | 'webauthn_register' | 'webauthn_login'

/**
 * Owner recorded in `cogenta_login_tickets` for a spent `webauthn_login`
 * ticket: the account is not known until the assertion arrives, and the column
 * is not nullable. Not a valid user id, so a change of any account's factors
 * never sweeps it away.
 */
const WEBAUTHN_LOGIN_TICKET_OWNER = 'webauthn-login:anonymous'

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
  /**
   * Random id of a ticket (pentest 2026-10-26, F-03). The signature says the
   * earlier step happened; the row this id names in `cogenta_login_tickets`
   * says it has not been spent yet. Carried by the login ticket and by both
   * WebAuthn tickets, so a captured registration or assertion cannot be
   * replayed against the same challenge.
   */
  readonly jti?: string
}

interface VerifiedTicket {
  readonly expiresAt: number
  readonly userId: string | null
  readonly challenge: string | undefined
  readonly ttlMs: number | undefined
  readonly jti: string | undefined
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
      jti: unknown
    }
    if (parsed.purpose !== purpose) return null
    if (parsed.userId !== null && typeof parsed.userId !== 'string') return null
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) return null
    if (parsed.challenge !== undefined && typeof parsed.challenge !== 'string') return null
    if (parsed.ttlMs !== undefined && typeof parsed.ttlMs !== 'number') return null
    if (parsed.jti !== undefined && typeof parsed.jti !== 'string') return null
    return {
      expiresAt: parsed.expiresAt,
      userId: parsed.userId,
      challenge: parsed.challenge,
      ttlMs: parsed.ttlMs,
      jti: parsed.jti,
    }
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
  /**
   * The connecting address, when the transport knows it. Failed passwords
   * are backed off per account *and* address, so a stranger guessing from
   * elsewhere cannot lock the owner out with five wrong passwords every
   * fifteen minutes; the account alone only backs off at ten times the
   * usual count (a guess spread over many addresses). Hashed before it is
   * stored, never kept as such.
   */
  readonly ip?: string
}

/**
 * Threshold multiplier for the account-wide counter: the per-address one
 * does the everyday work, this one only catches a guess spread across
 * many addresses.
 */
const ACCOUNT_WIDE_SCALE = 10

let dummyHash: Promise<string> | undefined

/**
 * A password check against a hash nobody owns, so an unknown address costs
 * the same scrypt work as a real one: answering at once told an attacker
 * which addresses have an account.
 */
async function spendOnePasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('cogenta-timing-equaliser')
  await verifyPassword(password, await dummyHash)
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
   * The second factors this account has finished setting up — what a sign-in
   * would challenge for, and therefore what a step-up must protect.
   */
  enrolledFactors(userId: string): Promise<readonly ('totp' | 'webauthn')[]>
  /**
   * Re-authentication for a sensitive change (pentest 2026-10-26, F-01): proves
   * the current `password` **or** a current authenticator `code`, and marks
   * `session` as freshly re-authenticated for `STEP_UP_TTL_MS`. Nothing is
   * changed on a wrong proof, which is rate-limited like any password guess.
   * Returns when the mark expires (ISO 8601).
   */
  stepUp(
    userId: string,
    session: Pick<Session, 'id'>,
    proof: { readonly password?: string; readonly code?: string },
  ): Promise<{ readonly expiresAt: string }>
  /**
   * Throws `AUTH_STEP_UP_REQUIRED` unless `session` re-authenticated within
   * the last `STEP_UP_TTL_MS`. `session` must be freshly resolved, not cached.
   *
   * A session *created* within that window counts too: signing in is itself a
   * recent re-authentication. That is the only way a passkey-only account
   * (no password to type, no authenticator code) can ever step up — it signs
   * in again with the passkey and then acts.
   */
  assertSteppedUp(session: Pick<Session, 'stepUpUntil' | 'createdAt'>): void
  /**
   * Whether adding or changing a second factor on this account must be
   * preceded by a step-up: true when it already has a confirmed factor, **or**
   * a password. The first passkey or authenticator on a password account is a
   * new way in (or a lock-out), and a stolen session alone must not be able to
   * add it. False only for an account with neither — nothing there to confirm
   * against.
   */
  requiresStepUp(userId: string): Promise<boolean>
  /**
   * Confirms the code from the authenticator app, which is what makes the
   * factor real — and, in the same step, issues ten recovery codes (fiche 18
   * task 1). TOTP without recovery codes is a lock with one key: losing the
   * authenticator becomes a permanent lockout the moment this returns, so the
   * two are minted together rather than as a second, skippable step.
   */
  confirmTotpEnrolment(userId: string, token: string): Promise<RecoveryCodesIssued>
  /**
   * Turns TOTP back off. Recovery codes go with it: they exist to be a spare
   * key for TOTP, and there is nothing left for them to unlock once it is off.
   * Outstanding sign-in tickets are revoked with it.
   *
   * This method does not ask for a second proof — the HTTP route does, through
   * `stepUp` / `assertSteppedUp`, because a session alone is not enough to
   * remove a factor (pentest 2026-10-26, F-01).
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

/**
 * Whether a database error is a primary-key / unique violation on any of the
 * three dialects: Postgres `23505`, MySQL and MariaDB `ER_DUP_ENTRY` (1062),
 * SQLite `SQLITE_CONSTRAINT_*`. The driver error arrives wrapped in a
 * `CogentaError`, so the `cause` chain is walked.
 */
function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current)
    const record = current as {
      code?: unknown
      errno?: unknown
      message?: unknown
      cause?: unknown
    }
    if (
      record.code === '23505' ||
      record.code === 'ER_DUP_ENTRY' ||
      record.errno === 1062 ||
      (typeof record.code === 'string' && record.code.startsWith('SQLITE_CONSTRAINT'))
    ) {
      return true
    }
    if (
      typeof record.message === 'string' &&
      /unique constraint|duplicate (entry|key)|violates unique|primary key/iu.test(record.message)
    ) {
      return true
    }
    current = record.cause
  }
  return false
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
  const tickets = identifier(TABLES.loginTickets, db.dialect)

  /**
   * Registers a login ticket as spendable. Expired rows are swept here, on the
   * path that creates them, so the table stays as small as the number of
   * sign-ins in the last five minutes: no scheduled job to forget.
   */
  async function registerLoginTicket(
    id: string,
    userId: string,
    expiresAtMs: number,
  ): Promise<void> {
    const at = new Date(now()).toISOString()
    await db.query(sql`delete from ${tickets} where expires_at <= ${at}`)
    await db.query(sql`
      insert into ${tickets} (id, user_id, expires_at, used_at)
      values (${id}, ${userId}, ${new Date(expiresAtMs).toISOString()}, ${null})`)
  }

  /** True while the ticket is registered for this account, unspent and unexpired. */
  async function loginTicketIsLive(id: string, userId: string): Promise<boolean> {
    const at = new Date(now()).toISOString()
    const result = await db.query<{ id: string }>(
      sql`select id from ${tickets}
          where id = ${id} and user_id = ${userId} and used_at is null and expires_at > ${at}`,
    )
    return result.rows.length > 0
  }

  /**
   * Spends the ticket. The `used_at is null` guard is what makes single use
   * real (the `resets.ts` idiom): of any number of simultaneous callers, one
   * UPDATE matches.
   */
  async function spendLoginTicket(id: string, userId: string): Promise<boolean> {
    const at = new Date(now()).toISOString()
    const result = await db.query(
      sql`update ${tickets} set used_at = ${at}
          where id = ${id} and user_id = ${userId} and used_at is null and expires_at > ${at}`,
    )
    return result.rowsAffected > 0
  }

  /**
   * Spends a passkey sign-in ticket by inserting its id: the primary key makes
   * the insert the claim, and a duplicate-key failure means it was used
   * already. Nothing is written when the ticket is issued — `begin` is open to
   * anyone, and a row per call would let an anonymous flood fill this table —
   * so only a ticket that carried a valid signature and has not expired ever
   * costs a row. Expired rows are swept here, as for the other tickets.
   */
  async function claimWebAuthnLoginTicket(id: string, expiresAtMs: number): Promise<boolean> {
    const at = new Date(now()).toISOString()
    await db.query(sql`delete from ${tickets} where expires_at <= ${at}`)
    try {
      await db.query(sql`
        insert into ${tickets} (id, user_id, expires_at, used_at)
        values (${id}, ${WEBAUTHN_LOGIN_TICKET_OWNER}, ${new Date(expiresAtMs).toISOString()}, ${at})`)
      return true
    } catch (error) {
      if (isUniqueViolation(error)) return false
      throw error
    }
  }

  /** A change of second factor voids every sign-in step already in flight. */
  async function revokeLoginTickets(userId: string): Promise<void> {
    await db.query(sql`delete from ${tickets} where user_id = ${userId}`)
  }

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

  async function confirmLegacyTotp(userId: string, step: number): Promise<boolean> {
    await credentials.confirmTotp(userId)
    return credentials.claimTotpStep(userId, step)
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

  async function mfaChallenge(
    user: User,
    available: readonly ('totp' | 'webauthn')[],
    ttlMs: number | undefined,
  ): Promise<LoginResult> {
    const jti = randomBytes(18).toString('base64url')
    const expiresAt = now() + TICKET_TTL_MS
    await registerLoginTicket(jti, user.id, expiresAt)
    return {
      status: 'mfa_required',
      ticket: signTicket(signingKey, {
        purpose: 'login',
        userId: user.id,
        expiresAt,
        jti,
        ...(ttlMs === undefined ? {} : { ttlMs }),
      }),
      availableFactors: available,
    }
  }

  function accountGone(): CogentaError {
    return new CogentaError({
      code: 'AUTH_USER_NOT_FOUND',
      message: 'This account no longer exists or is disabled.',
      hint: 'It may have been removed between the password step and this one. Sign in again.',
    })
  }

  function stepUpRequired(): CogentaError {
    return new CogentaError({
      code: 'AUTH_STEP_UP_REQUIRED',
      message: 'This change needs you to confirm it is you.',
      hint: 'Send your current password or a current authenticator code to POST /api/auth/step-up, then repeat the request within five minutes.',
    })
  }

  /** The ticket step shared by both second-factor completions: signed, registered, unspent. */
  async function liveLoginTicket(ticket: string): Promise<{
    readonly userId: string
    readonly jti: string
    readonly ttlMs: number | undefined
  }> {
    const verified = verifyTicket(signingKey, 'login', ticket, now())
    if (verified === null || verified.userId === null || verified.jti === undefined) {
      throw invalidTicket()
    }
    if (!(await loginTicketIsLive(verified.jti, verified.userId))) throw invalidTicket()
    return { userId: verified.userId, jti: verified.jti, ttlMs: verified.ttlMs }
  }

  return {
    passwordLogin: async (email, password, context) => {
      const subject = email.trim().toLowerCase()
      if (context?.ip === undefined || context.ip === '') {
        await rateLimit.reserve(subject)
      } else {
        const place = `ip:${createHash('sha256').update(context.ip).digest('base64url').slice(0, 16)}`
        await rateLimit.reserveScoped(subject, place, ACCOUNT_WIDE_SCALE)
      }

      const user = await users.byEmail(subject)
      let valid = false
      if (user === null) await spendOnePasswordCheck(password)
      else valid = await credentials.verifyPassword(user.id, password)

      if (!valid || user === null || user.status !== 'active') {
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
        : await mfaChallenge(user, factors, context?.ttlMs)
    },

    totpLogin: async (ticket, token, context) => {
      const { userId, jti, ttlMs } = await liveLoginTicket(ticket)

      await rateLimit.reserve(`mfa:${userId}`)
      const stored = await credentials.totpSecret(userId)
      const step =
        stored !== null && stored.verified
          ? matchTotpStep(token, stored.secret, { now: Math.floor(now() / 1000) })
          : null

      if (step === null) {
        throw new CogentaError({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Incorrect verification code.',
          hint: 'Check the code from your authenticator app. Codes are valid for 30 seconds.',
        })
      }

      // Re-checked at the last step, not only at the password step: the account
      // may have been disabled or removed in the minutes between the two.
      const user = await users.byId(userId)
      if (user === null || user.status !== 'active') throw accountGone()

      // A time step is accepted once per account (pentest 2026-10-26, F-03).
      // Claimed before the ticket so a code reused inside its window does not
      // also burn a ticket the person could still finish with the next code.
      if (!(await credentials.claimTotpStep(userId, step))) {
        throw new CogentaError({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'This verification code was already used.',
          hint: 'Wait for your authenticator app to show the next code, then try again.',
        })
      }
      if (!(await spendLoginTicket(jti, userId))) throw invalidTicket()

      await rateLimit.clear(`mfa:${userId}`)
      return issueSession(user, sessionContextFrom(context, ttlMs))
    },

    recoveryCodeLogin: async (ticket, code, context) => {
      const { userId, jti, ttlMs } = await liveLoginTicket(ticket)

      // Its own rate-limit subject, independent of `mfa:` (the TOTP guess
      // counter) and `totp-setup:` — a wrong code here is a different event
      // from a wrong 6-digit code, and neither should give the other a free
      // pass on attempts.
      await rateLimit.reserve(`recovery:${userId}`)
      const user = await users.byId(userId)
      if (user === null || user.status !== 'active') throw accountGone()

      const consumed = await credentials.consumeRecoveryCode(userId, code)
      if (!consumed) {
        throw new CogentaError({
          code: 'AUTH_RECOVERY_CODE_INVALID',
          message: 'This recovery code is not valid.',
          hint: 'Check you typed it exactly as it was shown, dashes included. Each code works once.',
        })
      }
      if (!(await spendLoginTicket(jti, userId))) throw invalidTicket()

      await rateLimit.clear(`recovery:${userId}`)
      return issueSession(user, sessionContextFrom(context, ttlMs))
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
      //
      // Stored as a *pending* enrolment beside the active factor, never over
      // it (pentest 2026-10-26, F-01): starting, abandoning, letting expire or
      // failing a re-enrolment leaves the account exactly as protected as it
      // was. The pending secret becomes the factor only in `confirmTotpEnrolment`.
      const secret = generateTotpSecret()
      await credentials.setPendingTotp(user.id, secret, now() + PENDING_TOTP_TTL_MS)
      return { secret, uri: totpUri(secret, issuer, user.email) }
    },

    enrolledFactors,

    stepUp: async (userId, session, proof) => {
      const hasPassword = proof.password !== undefined && proof.password !== ''
      const hasCode = proof.code !== undefined && proof.code !== ''
      if (!hasPassword && !hasCode) {
        throw new CogentaError({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Send your current password or a current authenticator code.',
          hint: 'The body takes { "password": "…" } or { "code": "123456" }.',
        })
      }

      await rateLimit.reserve(`step-up:${userId}`)
      let proven = false
      if (hasPassword && proof.password !== undefined) {
        proven = await credentials.verifyPassword(userId, proof.password)
      } else if (hasCode && proof.code !== undefined) {
        const stored = await credentials.totpSecret(userId)
        const step =
          stored !== null && stored.verified
            ? matchTotpStep(proof.code, stored.secret, { now: Math.floor(now() / 1000) })
            : null
        // The same once-per-step rule as signing in: a code that has just
        // been spent cannot be spent again as a proof.
        proven = step !== null && (await credentials.claimTotpStep(userId, step))
      }
      if (!proven) {
        throw new CogentaError({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: hasPassword ? 'Incorrect password.' : 'Incorrect verification code.',
          hint: 'Check it and try again. Repeated failures are rate-limited.',
        })
      }

      await rateLimit.clear(`step-up:${userId}`)
      const until = now() + STEP_UP_TTL_MS
      await sessions.markSteppedUp(session.id, until)
      return { expiresAt: new Date(until).toISOString() }
    },

    assertSteppedUp: (session) => {
      const at = now()
      const proven =
        session.stepUpUntil !== undefined && new Date(session.stepUpUntil).getTime() > at
      // Signing in is a re-authentication too — and the only kind a passkey-only
      // account has to offer.
      const justSignedIn = new Date(session.createdAt).getTime() + STEP_UP_TTL_MS > at
      if (!proven && !justSignedIn) throw stepUpRequired()
    },

    requiresStepUp: async (userId) =>
      (await enrolledFactors(userId)).length > 0 || (await credentials.hasPassword(userId)),

    confirmTotpEnrolment: async (userId, token) => {
      await rateLimit.reserve(`totp-setup:${userId}`)
      const pending = await credentials.pendingTotp(userId)
      // A secret stored unconfirmed in the active slot is what versions before
      // this fix wrote on `enrol`; honour it so an enrolment started before an
      // upgrade can still be finished.
      const legacy = pending === null ? await credentials.totpSecret(userId) : null
      const secret = pending?.secret ?? (legacy !== null && !legacy.verified ? legacy.secret : null)
      const step =
        secret === null ? null : matchTotpStep(token, secret, { now: Math.floor(now() / 1000) })

      if (secret === null || step === null) {
        throw new CogentaError({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Incorrect verification code.',
          hint: 'Check the code from your authenticator app. Codes are valid for 30 seconds. A setup left open for more than ten minutes has to be started again.',
        })
      }

      // The swap: pending becomes the factor in one transaction, and only one of
      // two simultaneous confirmations can claim it.
      const swapped =
        pending !== null
          ? await credentials.promotePendingTotp(userId, secret, step)
          : await confirmLegacyTotp(userId, step)
      if (!swapped) {
        throw new CogentaError({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'This setup was replaced or has already been confirmed.',
          hint: 'Start the setup again from the profile screen.',
        })
      }

      await rateLimit.clear(`totp-setup:${userId}`)
      // The secret behind two-step sign-in just changed: any sign-in begun
      // against the old one is void.
      await revokeLoginTickets(userId)
      // Minted in the same step, not a follow-up the person could skip: TOTP
      // with no recovery codes is a lock with exactly one key, and losing the
      // authenticator would be a permanent lockout the moment this returns.
      return issueRecoveryCodes(userId)
    },

    disableTotp: async (userId) => {
      await credentials.removeTotp(userId)
      // Nothing left for them to be a spare key for once TOTP itself is off.
      await credentials.removeRecoveryCodes(userId)
      await revokeLoginTickets(userId)
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
      const expiresAt = now() + TICKET_TTL_MS
      const jti = randomBytes(18).toString('base64url')
      await registerLoginTicket(jti, userId, expiresAt)
      return {
        options,
        ticket: signTicket(signingKey, {
          purpose: 'webauthn_register',
          userId,
          challenge,
          expiresAt,
          jti,
        }),
      }
    },

    completeWebAuthnRegistration: async (ticket, response, label) => {
      if (webauthnConfig === undefined) throw webauthnNotConfigured()
      const verified = verifyTicket(signingKey, 'webauthn_register', ticket, now())
      if (
        verified === null ||
        verified.userId === null ||
        verified.challenge === undefined ||
        verified.jti === undefined
      ) {
        throw invalidTicket()
      }
      // Spent before anything is verified or stored: of two simultaneous
      // completions of the same ceremony, one UPDATE matches.
      if (!(await spendLoginTicket(verified.jti, verified.userId))) throw invalidTicket()
      // The account may have been disabled or removed since the ceremony began.
      const owner = await users.byId(verified.userId)
      if (owner === null || owner.status !== 'active') throw accountGone()

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
      const expiresAt = now() + TICKET_TTL_MS
      // No row is written here (see `claimWebAuthnLoginTicket`): this call is
      // anonymous, and the id only becomes a row when the ticket is spent.
      const jti = randomBytes(18).toString('base64url')
      return {
        options,
        ticket: signTicket(signingKey, {
          purpose: 'webauthn_login',
          userId: null,
          challenge,
          expiresAt,
          jti,
        }),
      }
    },

    completeWebAuthnLogin: async (ticket, response, context) => {
      if (webauthnConfig === undefined) throw webauthnNotConfigured()
      const verified = verifyTicket(signingKey, 'webauthn_login', ticket, now())
      if (verified === null || verified.challenge === undefined || verified.jti === undefined) {
        throw invalidTicket()
      }
      // Spent before the assertion is checked or a session issued: a captured
      // assertion replayed against the same challenge finds the ticket gone.
      if (!(await claimWebAuthnLoginTicket(verified.jti, verified.expiresAt))) {
        throw invalidTicket()
      }

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
