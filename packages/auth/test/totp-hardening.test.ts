import { createHmac } from 'node:crypto'
import { createSqliteHandle, type DatabaseHandle, isCogentaError } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createCredentialStore } from '../src/credentials.js'
import { type AuthService, createAuthService } from '../src/login.js'
import { createSessionStore } from '../src/sessions.js'
import { createUserStore } from '../src/users.js'
import { type FileDb, testDb, testFileDb } from './helpers/db.js'
import { codeFor } from './helpers/totp-code.js'

/**
 * Pentest 2026-10-26, findings F-01 and F-03: what the second factor protects
 * must survive a re-enrolment that is begun, abandoned, expired or fumbled, a
 * sign-in ticket must work once, and a TOTP time step must be accepted once.
 * Each scenario below is the safe counterpart of the reproduction in
 * `docs/qa/pentest-2026-10-26/reproduce-auth-findings.mjs`.
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'
const PASSWORD = 'correct horse battery staple'
const FIXTURE_SECRET = 'JBSWY3DPEHPK3PXP'
const T0 = Date.parse('2026-10-26T08:00:00Z')
const STEP_MS = 30_000

async function fixture() {
  let time = T0
  const now = () => time
  const db = await testDb()
  const users = createUserStore(db, now)
  const credentials = createCredentialStore(db, now)
  const sessions = createSessionStore(db, now)
  const auth = createAuthService({ db, signingKey: SIGNING_KEY, collections: [], now })
  const user = await users.create({ email: 'admin@example.com', roles: ['admin'] })
  await credentials.setPassword(user.id, PASSWORD)
  return {
    db,
    users,
    credentials,
    sessions,
    auth,
    user,
    now,
    advance: (ms: number) => {
      time += ms
    },
    /** An account that already has a confirmed TOTP factor. */
    withTotp: async () => {
      await credentials.setTotpSecret(user.id, FIXTURE_SECRET)
      await credentials.confirmTotp(user.id)
    },
    codeNow: (secret: string = FIXTURE_SECRET) => codeFor(secret, time / 1000),
  }
}

async function challenge(auth: AuthService): Promise<string> {
  const result = await auth.passwordLogin('admin@example.com', PASSWORD)
  if (result.status !== 'mfa_required') throw new Error('expected an MFA challenge')
  return result.ticket
}

async function failureCode(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (error) {
    if (isCogentaError(error)) return error.code
    throw error
  }
  throw new Error('expected the call to be refused')
}

describe('re-enrolment never touches the active factor (F-01)', () => {
  it('keeps asking for a code after a re-enrolment is begun and abandoned', async () => {
    const f = await fixture()
    await f.withTotp()
    expect((await f.auth.passwordLogin('admin@example.com', PASSWORD)).status).toBe('mfa_required')

    await f.auth.beginTotpEnrolment(f.user.id)

    expect(await f.credentials.totpSecret(f.user.id)).toEqual({
      secret: FIXTURE_SECRET,
      verified: true,
    })
    expect((await f.auth.passwordLogin('admin@example.com', PASSWORD)).status).toBe('mfa_required')
    await f.db.close()
  })

  it('keeps the old factor working after the pending enrolment expires', async () => {
    const f = await fixture()
    await f.withTotp()
    const setup = await f.auth.beginTotpEnrolment(f.user.id)

    f.advance(10 * 60 * 1000 + 1)
    expect(await f.credentials.pendingTotp(f.user.id)).toBeNull()
    expect(await failureCode(f.auth.confirmTotpEnrolment(f.user.id, f.codeNow(setup.secret)))).toBe(
      'AUTH_INVALID_CREDENTIALS',
    )

    const ticket = await challenge(f.auth)
    const result = await f.auth.totpLogin(ticket, f.codeNow())
    expect(result.status).toBe('session')
    await f.db.close()
  })

  it('keeps the old factor after a wrong code is typed for the new one', async () => {
    const f = await fixture()
    await f.withTotp()
    await f.auth.beginTotpEnrolment(f.user.id)

    expect(await failureCode(f.auth.confirmTotpEnrolment(f.user.id, '000000'))).toBe(
      'AUTH_INVALID_CREDENTIALS',
    )
    expect((await f.credentials.totpSecret(f.user.id))?.secret).toBe(FIXTURE_SECRET)
    expect((await f.auth.passwordLogin('admin@example.com', PASSWORD)).status).toBe('mfa_required')
    await f.db.close()
  })

  it('swaps the factor only when the new code is confirmed: old secret out, new secret in', async () => {
    const f = await fixture()
    await f.withTotp()
    const setup = await f.auth.beginTotpEnrolment(f.user.id)

    const issued = await f.auth.confirmTotpEnrolment(f.user.id, f.codeNow(setup.secret))
    expect(issued.codes).toHaveLength(10)
    expect((await f.credentials.totpSecret(f.user.id))?.secret).toBe(setup.secret)
    expect(await f.credentials.pendingTotp(f.user.id)).toBeNull()

    f.advance(STEP_MS)
    const oldCodeTicket = await challenge(f.auth)
    expect(await failureCode(f.auth.totpLogin(oldCodeTicket, f.codeNow(FIXTURE_SECRET)))).toBe(
      'AUTH_INVALID_CREDENTIALS',
    )
    const result = await f.auth.totpLogin(oldCodeTicket, f.codeNow(setup.secret))
    expect(result.status).toBe('session')
    await f.db.close()
  })

  it('voids a sign-in begun against the old factor once the factor changes', async () => {
    const f = await fixture()
    await f.withTotp()
    const staleTicket = await challenge(f.auth)

    const setup = await f.auth.beginTotpEnrolment(f.user.id)
    await f.auth.confirmTotpEnrolment(f.user.id, f.codeNow(setup.secret))
    f.advance(STEP_MS)

    expect(await failureCode(f.auth.totpLogin(staleTicket, f.codeNow(setup.secret)))).toBe(
      'AUTH_SESSION_INVALID',
    )
    await f.db.close()
  })

  it('voids outstanding sign-in tickets when TOTP is turned off', async () => {
    const f = await fixture()
    await f.withTotp()
    const staleTicket = await challenge(f.auth)

    await f.auth.disableTotp(f.user.id)

    expect(await failureCode(f.auth.totpLogin(staleTicket, f.codeNow()))).toBe(
      'AUTH_SESSION_INVALID',
    )
    await f.db.close()
  })

  it('a first enrolment is pending until confirmed, then becomes the active factor', async () => {
    const f = await fixture()
    expect(await f.auth.enrolledFactors(f.user.id)).toEqual([])
    const setup = await f.auth.beginTotpEnrolment(f.user.id)
    expect(await f.auth.enrolledFactors(f.user.id)).toEqual([])

    await f.auth.confirmTotpEnrolment(f.user.id, f.codeNow(setup.secret))
    expect(await f.auth.enrolledFactors(f.user.id)).toEqual(['totp'])
    await f.db.close()
  })

  it('finishes an enrolment that an earlier version left unconfirmed in the active slot', async () => {
    const f = await fixture()
    await f.credentials.setTotpSecret(f.user.id, FIXTURE_SECRET)

    await f.auth.confirmTotpEnrolment(f.user.id, f.codeNow())
    expect((await f.credentials.totpSecret(f.user.id))?.verified).toBe(true)
    await f.db.close()
  })
})

describe('two simultaneous confirmations of one re-enrolment (F-01)', () => {
  let file: FileDb | undefined
  let second: DatabaseHandle | undefined

  afterEach(async () => {
    if (second !== undefined) await second.close()
    if (file !== undefined) await file.dispose()
    second = undefined
    file = undefined
  })

  it('lets exactly one of them swap the factor', async () => {
    file = await testFileDb()
    second = await createSqliteHandle({ url: file.path })
    const now = () => T0
    const first = createAuthService({ db: file.db, signingKey: SIGNING_KEY, collections: [], now })
    const other = createAuthService({ db: second, signingKey: SIGNING_KEY, collections: [], now })
    const credentials = createCredentialStore(file.db, now)
    const user = await createUserStore(file.db, now).create({
      email: 'admin@example.com',
      roles: ['admin'],
    })
    await credentials.setTotpSecret(user.id, FIXTURE_SECRET)
    await credentials.confirmTotp(user.id)

    const setup = await first.beginTotpEnrolment(user.id)
    const code = codeFor(setup.secret, T0 / 1000)
    const outcomes = await Promise.allSettled([
      first.confirmTotpEnrolment(user.id, code),
      other.confirmTotpEnrolment(user.id, code),
    ])

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1)
    expect((await credentials.totpSecret(user.id))?.secret).toBe(setup.secret)
  })
})

describe('step-up (F-01)', () => {
  async function withSession() {
    const f = await fixture()
    await f.withTotp()
    const session = await f.sessions.create(f.user.id)
    return { ...f, session }
  }

  it('refuses a session that has not re-authenticated', async () => {
    const f = await withSession()
    expect(() => f.auth.assertSteppedUp(f.session)).toThrowError(
      expect.objectContaining({ code: 'AUTH_STEP_UP_REQUIRED' }),
    )
    await f.db.close()
  })

  it('accepts the current password and honours it for five minutes, not longer', async () => {
    const f = await withSession()
    const proven = await f.auth.stepUp(f.user.id, f.session, { password: PASSWORD })
    expect(Date.parse(proven.expiresAt)).toBe(T0 + 5 * 60 * 1000)

    const fresh = await f.sessions.resolve(f.session.token)
    expect(fresh).not.toBeNull()
    if (fresh === null) throw new Error('unreachable')
    expect(() => f.auth.assertSteppedUp(fresh)).not.toThrow()

    f.advance(5 * 60 * 1000 + 1)
    const stale = await f.sessions.resolve(f.session.token)
    if (stale === null) throw new Error('unreachable')
    expect(() => f.auth.assertSteppedUp(stale)).toThrowError(
      expect.objectContaining({ code: 'AUTH_STEP_UP_REQUIRED' }),
    )
    await f.db.close()
  })

  it('accepts a current authenticator code, once', async () => {
    const f = await withSession()
    const code = f.codeNow()
    await f.auth.stepUp(f.user.id, f.session, { code })
    expect(await failureCode(f.auth.stepUp(f.user.id, f.session, { code }))).toBe(
      'AUTH_INVALID_CREDENTIALS',
    )
    await f.db.close()
  })

  it('does not mark the session on a wrong password or a wrong code', async () => {
    const f = await withSession()
    expect(await failureCode(f.auth.stepUp(f.user.id, f.session, { password: 'nope-nope' }))).toBe(
      'AUTH_INVALID_CREDENTIALS',
    )
    expect(await failureCode(f.auth.stepUp(f.user.id, f.session, { code: '000000' }))).toBe(
      'AUTH_INVALID_CREDENTIALS',
    )
    expect(await failureCode(f.auth.stepUp(f.user.id, f.session, {}))).toBe(
      'AUTH_INVALID_CREDENTIALS',
    )
    const row = await f.sessions.resolve(f.session.token)
    expect(row?.stepUpUntil).toBeUndefined()
    await f.db.close()
  })

  it("a step-up on one session does not carry over to the account's other sessions", async () => {
    const f = await withSession()
    const other = await f.sessions.create(f.user.id)
    await f.auth.stepUp(f.user.id, f.session, { password: PASSWORD })

    const untouched = await f.sessions.resolve(other.token)
    if (untouched === null) throw new Error('unreachable')
    expect(() => f.auth.assertSteppedUp(untouched)).toThrowError(
      expect.objectContaining({ code: 'AUTH_STEP_UP_REQUIRED' }),
    )
    await f.db.close()
  })
})

describe('a sign-in ticket and a TOTP step are accepted once (F-03)', () => {
  it('refuses the same ticket with the same code a second time', async () => {
    const f = await fixture()
    await f.withTotp()
    const ticket = await challenge(f.auth)
    const code = f.codeNow()

    const first = await f.auth.totpLogin(ticket, code)
    expect(first.status).toBe('session')
    expect(await failureCode(f.auth.totpLogin(ticket, code))).toBe('AUTH_SESSION_INVALID')
    expect(await f.sessions.list(f.user.id)).toHaveLength(1)
    await f.db.close()
  })

  it('refuses a spent ticket even with the code of the next time step', async () => {
    const f = await fixture()
    await f.withTotp()
    const ticket = await challenge(f.auth)
    expect((await f.auth.totpLogin(ticket, f.codeNow())).status).toBe('session')

    f.advance(STEP_MS)
    expect(await failureCode(f.auth.totpLogin(ticket, f.codeNow()))).toBe('AUTH_SESSION_INVALID')
    await f.db.close()
  })

  it('refuses a code whose time step was already accepted, with a fresh ticket', async () => {
    const f = await fixture()
    await f.withTotp()
    const code = f.codeNow()
    expect((await f.auth.totpLogin(await challenge(f.auth), code)).status).toBe('session')

    const second = await challenge(f.auth)
    expect(await failureCode(f.auth.totpLogin(second, code))).toBe('AUTH_INVALID_CREDENTIALS')

    // The refusal did not burn the ticket: the next code finishes the sign-in.
    f.advance(STEP_MS)
    expect((await f.auth.totpLogin(second, f.codeNow())).status).toBe('session')
    await f.db.close()
  })

  it('refuses an older step once a newer one was accepted, though it is inside the drift window', async () => {
    const f = await fixture()
    await f.withTotp()
    const previous = f.codeNow()
    f.advance(STEP_MS)
    expect((await f.auth.totpLogin(await challenge(f.auth), f.codeNow())).status).toBe('session')

    expect(await failureCode(f.auth.totpLogin(await challenge(f.auth), previous))).toBe(
      'AUTH_INVALID_CREDENTIALS',
    )
    await f.db.close()
  })

  it('does not spend the ticket on a wrong code, so a typo can be retried', async () => {
    const f = await fixture()
    await f.withTotp()
    const ticket = await challenge(f.auth)

    expect(await failureCode(f.auth.totpLogin(ticket, '000000'))).toBe('AUTH_INVALID_CREDENTIALS')
    expect((await f.auth.totpLogin(ticket, f.codeNow())).status).toBe('session')
    await f.db.close()
  })

  it('also spends the ticket when a recovery code finishes the sign-in', async () => {
    const f = await fixture()
    await f.withTotp()
    const setup = await f.auth.beginTotpEnrolment(f.user.id)
    const { codes } = await f.auth.confirmTotpEnrolment(f.user.id, f.codeNow(setup.secret))
    const [first, second] = codes
    if (first === undefined || second === undefined) throw new Error('no recovery codes')

    const ticket = await challenge(f.auth)
    expect((await f.auth.recoveryCodeLogin(ticket, first)).status).toBe('session')
    expect(await failureCode(f.auth.recoveryCodeLogin(ticket, second))).toBe('AUTH_SESSION_INVALID')
    await f.db.close()
  })

  it('refuses a ticket without an id, such as one signed by a version before this fix', async () => {
    const f = await fixture()
    await f.withTotp()
    const payload = Buffer.from(
      JSON.stringify({ purpose: 'login', userId: f.user.id, expiresAt: T0 + 60_000 }),
    ).toString('base64url')
    const signature = createHmac('sha256', SIGNING_KEY).update(payload).digest('base64url')

    expect(await failureCode(f.auth.totpLogin(`${payload}.${signature}`, f.codeNow()))).toBe(
      'AUTH_SESSION_INVALID',
    )
    await f.db.close()
  })

  it('refuses a ticket once its five minutes are up', async () => {
    const f = await fixture()
    await f.withTotp()
    const ticket = await challenge(f.auth)
    f.advance(5 * 60 * 1000 + 1)

    expect(await failureCode(f.auth.totpLogin(ticket, f.codeNow()))).toBe('AUTH_SESSION_INVALID')
    await f.db.close()
  })

  it('re-checks the account at the last step: a disabled account gets no session', async () => {
    const f = await fixture()
    await f.withTotp()
    const ticket = await challenge(f.auth)
    await f.users.setStatus(f.user.id, 'disabled')

    expect(await failureCode(f.auth.totpLogin(ticket, f.codeNow()))).toBe('AUTH_USER_NOT_FOUND')
    expect(await f.sessions.list(f.user.id)).toHaveLength(0)
    await f.db.close()
  })
})

describe('two simultaneous identical sign-ins (F-03)', () => {
  let file: FileDb | undefined
  let second: DatabaseHandle | undefined

  afterEach(async () => {
    if (second !== undefined) await second.close()
    if (file !== undefined) await file.dispose()
    second = undefined
    file = undefined
  })

  it('create exactly one session', async () => {
    file = await testFileDb()
    second = await createSqliteHandle({ url: file.path })
    const now = () => T0
    const first = createAuthService({ db: file.db, signingKey: SIGNING_KEY, collections: [], now })
    const other = createAuthService({ db: second, signingKey: SIGNING_KEY, collections: [], now })
    const credentials = createCredentialStore(file.db, now)
    const user = await createUserStore(file.db, now).create({
      email: 'admin@example.com',
      roles: ['admin'],
    })
    await credentials.setPassword(user.id, PASSWORD)
    await credentials.setTotpSecret(user.id, FIXTURE_SECRET)
    await credentials.confirmTotp(user.id)

    const challenged = await first.passwordLogin('admin@example.com', PASSWORD)
    if (challenged.status !== 'mfa_required') throw new Error('expected an MFA challenge')
    const code = codeFor(FIXTURE_SECRET, T0 / 1000)

    const outcomes = await Promise.allSettled([
      first.totpLogin(challenged.ticket, code),
      other.totpLogin(challenged.ticket, code),
    ])

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
    expect(await createSessionStore(file.db, now).list(user.id)).toHaveLength(1)
  })
})
