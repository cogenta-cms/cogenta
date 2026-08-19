import { isCogentaError } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { createCredentialStore } from '../src/credentials.js'
import { createAuthService } from '../src/login.js'
import { hashRecoveryCode } from '../src/recovery-codes.js'
import { createUserStore } from '../src/users.js'
import { testDb } from './helpers/db.js'
import { codeFor } from './helpers/totp-code.js'

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'
const NO_MFA_COLLECTIONS: readonly CollectionDefinition[] = []
const PUBLISH_COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {},
    permissions: { publish: ['editor'] },
  },
]
const WEBAUTHN_CONFIG = {
  relyingPartyName: 'Cogenta Test',
  relyingPartyId: 'example.com',
  origin: 'https://example.com',
}

async function setup(
  collections: readonly CollectionDefinition[],
  now: () => number = Date.now,
  webauthn?: typeof WEBAUTHN_CONFIG,
) {
  const db = await testDb()
  const users = createUserStore(db, now)
  const credentials = createCredentialStore(db, now)
  const auth = createAuthService({
    db,
    signingKey: SIGNING_KEY,
    collections,
    now,
    ...(webauthn === undefined ? {} : { webauthn }),
  })
  return { db, users, credentials, auth }
}

describe('passwordLogin', () => {
  it('issues a session directly for a role that does not require MFA', async () => {
    const { users, credentials, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    const result = await auth.passwordLogin('alice@example.com', 'correct horse battery staple')
    expect(result.status).toBe('session')
    if (result.status === 'session') {
      expect(result.user.id).toBe(user.id)
      expect(result.session.token).toBeTruthy()
    }
  })

  it('rejects a wrong password without revealing whether the email exists', async () => {
    const { users, credentials, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    await expect(auth.passwordLogin('alice@example.com', 'wrong')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    })
    await expect(
      auth.passwordLogin('nobody@example.com', 'whatever-password'),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('rejects a disabled account even with the correct password', async () => {
    const { users, credentials, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')
    await users.setStatus(user.id, 'disabled')

    await expect(
      auth.passwordLogin('alice@example.com', 'correct horse battery staple'),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('returns mfa_required for a role with publish rights, listing its factors', async () => {
    const { users, credentials, auth } = await setup(PUBLISH_COLLECTIONS)
    const user = await users.create({ email: 'ed@example.com', roles: ['editor'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')
    await credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
    await credentials.confirmTotp(user.id)

    const result = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    expect(result.status).toBe('mfa_required')
    if (result.status === 'mfa_required') {
      expect(result.availableFactors).toEqual(['totp'])
      expect(result.ticket).toBeTruthy()
    }
  })

  // ADR-0021. A sensitive role used to be refused a session until it enrolled a
  // second factor, which locked the first admin of a brand-new site out of
  // their own site. The recommendation to turn MFA on now lives in the admin's
  // notices instead, where it persists but never blocks.
  it('signs a sensitive role straight in when it has no second factor set up', async () => {
    const { users, credentials, auth } = await setup(PUBLISH_COLLECTIONS)
    const user = await users.create({ email: 'ed@example.com', roles: ['editor'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    const result = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    expect(result.status).toBe('session')
  })

  it('signs a brand-new admin straight in, with no MFA ceremony in the way', async () => {
    const { users, credentials, auth } = await setup(PUBLISH_COLLECTIONS)
    const user = await users.create({ email: 'root@example.com', roles: ['admin'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    const result = await auth.passwordLogin('root@example.com', 'correct horse battery staple')
    expect(result.status).toBe('session')
    if (result.status === 'session') expect(result.session.token).toBeTruthy()
  })

  it('still challenges an account that enrolled TOTP, whatever its role', async () => {
    const { users, credentials, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'viewer@example.com', roles: ['viewer'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')
    await credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
    await credentials.confirmTotp(user.id)

    const result = await auth.passwordLogin('viewer@example.com', 'correct horse battery staple')
    expect(result.status).toBe('mfa_required')
  })

  it('ignores a TOTP secret that was never confirmed, rather than asking for a code nobody has', async () => {
    const { users, credentials, auth } = await setup(PUBLISH_COLLECTIONS)
    const user = await users.create({ email: 'ed@example.com', roles: ['editor'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')
    await credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')

    const result = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    expect(result.status).toBe('session')
  })

  it('rate-limits repeated failed password attempts for the same subject', async () => {
    const { users, credentials, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    for (let i = 0; i < 5; i += 1) {
      await auth.passwordLogin('alice@example.com', 'wrong').catch(() => undefined)
    }

    await expect(
      auth.passwordLogin('alice@example.com', 'correct horse battery staple'),
    ).rejects.toMatchObject({ code: 'AUTH_RATE_LIMITED' })
  })

  it('clears the rate-limit counter after a successful login', async () => {
    const { users, credentials, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    for (let i = 0; i < 3; i += 1) {
      await auth.passwordLogin('alice@example.com', 'wrong').catch(() => undefined)
    }
    await auth.passwordLogin('alice@example.com', 'correct horse battery staple')

    for (let i = 0; i < 3; i += 1) {
      await auth.passwordLogin('alice@example.com', 'wrong').catch(() => undefined)
    }
    // Only 3 fresh failures since the clear — still under the 5-attempt threshold.
    await expect(
      auth.passwordLogin('alice@example.com', 'correct horse battery staple'),
    ).resolves.toMatchObject({ status: 'session' })
  })
})

describe('totpLogin', () => {
  async function editorWithTotp() {
    const bundle = await setup(PUBLISH_COLLECTIONS)
    const user = await bundle.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await bundle.credentials.setPassword(user.id, 'correct horse battery staple')
    await bundle.credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
    await bundle.credentials.confirmTotp(user.id)
    return { ...bundle, user }
  }

  it('completes a login when given the correct code and a valid ticket', async () => {
    const { auth, user } = await editorWithTotp()
    const now = Math.floor(Date.now() / 1000)
    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    const code = codeFor('JBSWY3DPEHPK3PXP', now)
    const result = await auth.totpLogin(passwordResult.ticket, code)
    expect(result.status).toBe('session')
    if (result.status === 'session') expect(result.user.id).toBe(user.id)
  })

  it('rejects an incorrect code', async () => {
    const { auth } = await editorWithTotp()
    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    await expect(auth.totpLogin(passwordResult.ticket, '000000')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    })
  })

  it('rejects a tampered ticket', async () => {
    const { auth } = await editorWithTotp()
    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    const [payload] = passwordResult.ticket.split('.')
    const tampered = `${payload}.not-the-real-signature`
    await expect(auth.totpLogin(tampered, '000000')).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
    })
  })

  it('rejects an expired ticket', async () => {
    let clock = 1_000_000_000
    const bundle = await setup(PUBLISH_COLLECTIONS, () => clock)
    const user = await bundle.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await bundle.credentials.setPassword(user.id, 'correct horse battery staple')
    await bundle.credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
    await bundle.credentials.confirmTotp(user.id)

    const passwordResult = await bundle.auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    clock += 6 * 60 * 1000 // past the 5-minute ticket TTL
    await expect(bundle.auth.totpLogin(passwordResult.ticket, '000000')).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
    })
  })

  it('rejects a ticket signed for a different signing key', async () => {
    const bundle = await setup(PUBLISH_COLLECTIONS)
    const user = await bundle.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await bundle.credentials.setPassword(user.id, 'correct horse battery staple')
    await bundle.credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
    await bundle.credentials.confirmTotp(user.id)

    const otherAuth = createAuthService({
      db: bundle.db,
      signingKey: 'a-completely-different-key',
      collections: PUBLISH_COLLECTIONS,
    })
    const passwordResult = await otherAuth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    // The ticket was signed with a different key than this service holds.
    await expect(bundle.auth.totpLogin(passwordResult.ticket, '000000')).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
    })
  })
})

/**
 * Fiche 18 task 5 ("remember me") and task 2 (readable sessions): a choice
 * made at the password step has nowhere to live except the MFA ticket, since
 * no session exists yet when it is made.
 */
describe('LoginContext — remember me and device metadata', () => {
  it('uses a shorter session when a shorter ttlMs is requested at the password step', async () => {
    const { users, credentials, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    const oneHour = 60 * 60 * 1000
    const result = await auth.passwordLogin('alice@example.com', 'correct horse battery staple', {
      ttlMs: oneHour,
    })
    if (result.status !== 'session') throw new Error('expected a session')

    const lifetime =
      new Date(result.session.expiresAt).getTime() - new Date(result.session.createdAt).getTime()
    expect(lifetime).toBe(oneHour)
  })

  it('carries the remember-me choice across the TOTP step, from the ticket', async () => {
    const bundle = await setup(PUBLISH_COLLECTIONS)
    const user = await bundle.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await bundle.credentials.setPassword(user.id, 'correct horse battery staple')
    await bundle.credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
    await bundle.credentials.confirmTotp(user.id)

    const oneHour = 60 * 60 * 1000
    const passwordResult = await bundle.auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
      { ttlMs: oneHour },
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    const now = Math.floor(Date.now() / 1000)
    const code = codeFor('JBSWY3DPEHPK3PXP', now)
    const result = await bundle.auth.totpLogin(passwordResult.ticket, code)
    if (result.status !== 'session') throw new Error('expected a session')

    const lifetime =
      new Date(result.session.expiresAt).getTime() - new Date(result.session.createdAt).getTime()
    expect(lifetime).toBe(oneHour)
  })

  it('records a browser family and device type from the User-Agent, never the header itself', async () => {
    const { users, credentials, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    const result = await auth.passwordLogin('alice@example.com', 'correct horse battery staple', {
      userAgent,
    })
    if (result.status !== 'session') throw new Error('expected a session')
    expect(result.session.browser).toBe('chrome')
    expect(result.session.device).toBe('desktop')
  })

  it('reports "unknown" rather than storing anything when no User-Agent is given', async () => {
    const { users, credentials, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    const result = await auth.passwordLogin('alice@example.com', 'correct horse battery staple')
    if (result.status !== 'session') throw new Error('expected a session')
    expect(result.session.browser).toBe('unknown')
    expect(result.session.device).toBe('unknown')
  })
})

/**
 * ADR-0021 moved enrolment out of the sign-in flow entirely. It is no longer
 * driven by a ticket the password step handed out — it is driven by an already
 * signed-in session, from the account's own profile, and the only account it
 * can ever touch is the caller's own.
 */
describe('TOTP self-service enrolment', () => {
  async function signedInEditor() {
    const bundle = await setup(PUBLISH_COLLECTIONS)
    const user = await bundle.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await bundle.credentials.setPassword(user.id, 'correct horse battery staple')
    const result = await bundle.auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    if (result.status !== 'session') throw new Error('expected a session')
    return { ...bundle, user }
  }

  it('generates a secret and an otpauth:// URI naming the account', async () => {
    const { auth, user } = await signedInEditor()
    const enrolment = await auth.beginTotpEnrolment(user.id)

    expect(enrolment.secret.length).toBeGreaterThan(0)
    expect(enrolment.uri).toMatch(/^otpauth:\/\/totp\//)
    expect(decodeURIComponent(enrolment.uri)).toContain(user.email)
  })

  it('leaves the factor unusable until the code from the app confirms it', async () => {
    const { auth, credentials, user } = await signedInEditor()
    await auth.beginTotpEnrolment(user.id)

    expect((await credentials.totpSecret(user.id))?.verified).toBe(false)
    const beforeConfirming = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    expect(beforeConfirming.status).toBe('session')
  })

  it('makes the next sign-in ask for a code once enrolment is confirmed', async () => {
    const { auth, user } = await signedInEditor()
    const now = Math.floor(Date.now() / 1000)
    const enrolment = await auth.beginTotpEnrolment(user.id)
    await auth.confirmTotpEnrolment(user.id, codeFor(enrolment.secret, now))

    const second = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    expect(second.status).toBe('mfa_required')
    if (second.status === 'mfa_required') expect(second.availableFactors).toEqual(['totp'])
  })

  it('rejects the wrong code without confirming the secret', async () => {
    const { auth, credentials, user } = await signedInEditor()
    await auth.beginTotpEnrolment(user.id)

    await expect(auth.confirmTotpEnrolment(user.id, '000000')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    })
    expect((await credentials.totpSecret(user.id))?.verified).toBe(false)
  })

  it('only the most recently requested secret can be confirmed', async () => {
    const { auth, user } = await signedInEditor()
    const now = Math.floor(Date.now() / 1000)
    const first = await auth.beginTotpEnrolment(user.id)
    const second = await auth.beginTotpEnrolment(user.id)
    expect(second.secret).not.toBe(first.secret)

    await expect(
      auth.confirmTotpEnrolment(user.id, codeFor(first.secret, now)),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
    const confirmed = await auth.confirmTotpEnrolment(user.id, codeFor(second.secret, now))
    expect(confirmed.codes).toHaveLength(10)
  })

  it('refuses to enrol a disabled account', async () => {
    const { auth, users, user } = await signedInEditor()
    await users.setStatus(user.id, 'disabled')

    await expect(auth.beginTotpEnrolment(user.id)).rejects.toMatchObject({
      code: 'AUTH_USER_NOT_FOUND',
    })
  })

  it('turns the factor back off, and the next sign-in stops asking', async () => {
    const { auth, user } = await signedInEditor()
    const now = Math.floor(Date.now() / 1000)
    const enrolment = await auth.beginTotpEnrolment(user.id)
    await auth.confirmTotpEnrolment(user.id, codeFor(enrolment.secret, now))

    await auth.disableTotp(user.id)
    const after = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    expect(after.status).toBe('session')
  })

  it('rate-limits repeated wrong confirmation codes', async () => {
    const { auth, user } = await signedInEditor()
    await auth.beginTotpEnrolment(user.id)

    for (let i = 0; i < 5; i += 1) {
      await auth.confirmTotpEnrolment(user.id, '000000').catch(() => undefined)
    }
    await expect(auth.confirmTotpEnrolment(user.id, '000000')).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
    })
  })
})

/**
 * Fiche 18 task 1 — the priority of the whole fiche: losing an authenticator
 * must not be a permanent lockout when there is no admin-driven password
 * reset (`docs/plans/17-utilisateurs.md`'s deliberate decision).
 */
describe('recovery codes', () => {
  async function editorWithTotpAndRecoveryCodes() {
    const bundle = await setup(PUBLISH_COLLECTIONS)
    const user = await bundle.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await bundle.credentials.setPassword(user.id, 'correct horse battery staple')
    const enrolment = await bundle.auth.beginTotpEnrolment(user.id)
    const now = Math.floor(Date.now() / 1000)
    const issued = await bundle.auth.confirmTotpEnrolment(user.id, codeFor(enrolment.secret, now))
    return { ...bundle, user, secret: enrolment.secret, codes: issued.codes }
  }

  it('issues ten distinct codes the moment TOTP is confirmed', async () => {
    const { codes } = await editorWithTotpAndRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
  })

  it('signs in with a recovery code end to end: enrol, "lose" the authenticator, use a code', async () => {
    const { auth, user, codes } = await editorWithTotpAndRecoveryCodes()

    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    const firstCode = codes[0]
    if (firstCode === undefined) throw new Error('no code issued')
    const result = await auth.recoveryCodeLogin(passwordResult.ticket, firstCode)
    expect(result.status).toBe('session')
    if (result.status === 'session') expect(result.user.id).toBe(user.id)
  })

  it('consumes the code: the same code is refused on a second attempt', async () => {
    const { auth, codes } = await editorWithTotpAndRecoveryCodes()
    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')
    const code = codes[0]
    if (code === undefined) throw new Error('no code issued')

    await auth.recoveryCodeLogin(passwordResult.ticket, code)

    const second = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    if (second.status !== 'mfa_required') throw new Error('expected mfa_required')
    await expect(auth.recoveryCodeLogin(second.ticket, code)).rejects.toMatchObject({
      code: 'AUTH_RECOVERY_CODE_INVALID',
    })
  })

  it('accepts a code typed back lowercase and without its dash', async () => {
    const { auth, codes } = await editorWithTotpAndRecoveryCodes()
    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')
    const code = codes[0]
    if (code === undefined) throw new Error('no code issued')

    const messy = code.toLowerCase().replace('-', '')
    const result = await auth.recoveryCodeLogin(passwordResult.ticket, messy)
    expect(result.status).toBe('session')
  })

  it('rejects an unknown code', async () => {
    const { auth } = await editorWithTotpAndRecoveryCodes()
    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    await expect(
      auth.recoveryCodeLogin(passwordResult.ticket, 'AAAAA-AAAAA'),
    ).rejects.toMatchObject({ code: 'AUTH_RECOVERY_CODE_INVALID' })
  })

  it('reports remaining codes and decrements them as they are used', async () => {
    const { auth, user, codes } = await editorWithTotpAndRecoveryCodes()
    expect(await auth.recoveryCodesStatus(user.id)).toEqual({ total: 10, remaining: 10 })

    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')
    const code = codes[0]
    if (code === undefined) throw new Error('no code issued')
    await auth.recoveryCodeLogin(passwordResult.ticket, code)

    expect(await auth.recoveryCodesStatus(user.id)).toEqual({ total: 10, remaining: 9 })
  })

  it('reports zero for an account that never enrolled TOTP', async () => {
    const { auth, users } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    expect(await auth.recoveryCodesStatus(user.id)).toEqual({ total: 0, remaining: 0 })
  })

  it('regenerating invalidates every previous code', async () => {
    const { auth, user, codes } = await editorWithTotpAndRecoveryCodes()
    const fresh = await auth.regenerateRecoveryCodes(user.id)
    expect(fresh.codes).toHaveLength(10)
    expect(new Set(fresh.codes).size).toBe(10)

    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')
    const oldCode = codes[0]
    if (oldCode === undefined) throw new Error('no code issued')
    // A miss scans every one of the ten fresh, scrypt-hashed codes before
    // giving up — genuinely slower than a single check, hence the longer
    // timeout rather than a shortcut in the code under test.
    await expect(auth.recoveryCodeLogin(passwordResult.ticket, oldCode)).rejects.toMatchObject({
      code: 'AUTH_RECOVERY_CODE_INVALID',
    })

    const second = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    if (second.status !== 'mfa_required') throw new Error('expected mfa_required')
    const newCode = fresh.codes[0]
    if (newCode === undefined) throw new Error('no code issued')
    const result = await auth.recoveryCodeLogin(second.ticket, newCode)
    expect(result.status).toBe('session')
  }, 30_000)

  it('refuses to regenerate for an account with no confirmed TOTP', async () => {
    const { auth, users } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
    await expect(auth.regenerateRecoveryCodes(user.id)).rejects.toMatchObject({
      code: 'AUTH_RECOVERY_CODES_UNAVAILABLE',
    })
  })

  it('turning TOTP off removes the recovery codes too — nothing left for them to unlock', async () => {
    const { auth, user } = await editorWithTotpAndRecoveryCodes()
    await auth.disableTotp(user.id)
    expect(await auth.recoveryCodesStatus(user.id)).toEqual({ total: 0, remaining: 0 })
  })

  it('rate-limits repeated wrong recovery codes', async () => {
    const { auth, credentials, user } = await editorWithTotpAndRecoveryCodes()
    // A single outstanding code, set directly on the store: a miss then
    // costs one scrypt verify rather than a ten-wide scan, which is what
    // keeps six deliberately-wrong attempts fast enough for a unit test —
    // the scan-cost itself is covered on its own above.
    await credentials.setRecoveryCodes(user.id, [await hashRecoveryCode('REAL0-CODE0')])

    const passwordResult = await auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (passwordResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    for (let i = 0; i < 5; i += 1) {
      await auth.recoveryCodeLogin(passwordResult.ticket, 'AAAAA-AAAAA').catch(() => undefined)
    }
    await expect(
      auth.recoveryCodeLogin(passwordResult.ticket, 'AAAAA-AAAAA'),
    ).rejects.toMatchObject({ code: 'AUTH_RATE_LIMITED' })
  }, 15_000)
})

describe('WebAuthn passkeys', () => {
  it('refuses every passkey method when webauthn is not configured', async () => {
    const { users, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })

    await expect(auth.beginWebAuthnRegistration(user.id)).rejects.toMatchObject({
      code: 'AUTH_WEBAUTHN_FAILED',
    })
    await expect(auth.beginWebAuthnLogin()).rejects.toMatchObject({ code: 'AUTH_WEBAUTHN_FAILED' })
  })

  describe('registration', () => {
    it('issues options naming the relying party and a ticket', async () => {
      const { users, auth } = await setup(NO_MFA_COLLECTIONS, Date.now, WEBAUTHN_CONFIG)
      const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })

      const challenge = await auth.beginWebAuthnRegistration(user.id)
      expect(challenge.options.rp.id).toBe(WEBAUTHN_CONFIG.relyingPartyId)
      expect(challenge.options.user.name).toBe('alice@example.com')
      expect(challenge.ticket).toBeTruthy()
    })

    it('refuses registration for an unknown user', async () => {
      const { auth } = await setup(NO_MFA_COLLECTIONS, Date.now, WEBAUTHN_CONFIG)
      await expect(auth.beginWebAuthnRegistration('nonexistent')).rejects.toMatchObject({
        code: 'AUTH_USER_NOT_FOUND',
      })
    })

    it('rejects a forged registration response rather than throwing an unhandled error', async () => {
      const { users, auth } = await setup(NO_MFA_COLLECTIONS, Date.now, WEBAUTHN_CONFIG)
      const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
      const challenge = await auth.beginWebAuthnRegistration(user.id)

      await expect(
        auth.completeWebAuthnRegistration(challenge.ticket, {
          id: 'forged',
          rawId: 'forged',
          type: 'public-key',
          clientExtensionResults: {},
          response: {
            clientDataJSON: Buffer.from('{}').toString('base64url'),
            attestationObject: Buffer.from('not-real-cbor').toString('base64url'),
          },
        } as never),
      ).rejects.toMatchObject({ code: 'AUTH_WEBAUTHN_FAILED' })
    })

    it('rejects a tampered registration ticket', async () => {
      const { users, auth } = await setup(NO_MFA_COLLECTIONS, Date.now, WEBAUTHN_CONFIG)
      const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
      const challenge = await auth.beginWebAuthnRegistration(user.id)
      const [payload] = challenge.ticket.split('.')

      await expect(
        auth.completeWebAuthnRegistration(`${payload}.not-the-real-signature`, {} as never),
      ).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
    })

    it('refuses a login-purpose ticket for completing a registration', async () => {
      const { users, credentials, auth } = await setup(
        PUBLISH_COLLECTIONS,
        Date.now,
        WEBAUTHN_CONFIG,
      )
      const user = await users.create({ email: 'ed@example.com', roles: ['editor'] })
      await credentials.setPassword(user.id, 'correct horse battery staple')
      await credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
      await credentials.confirmTotp(user.id)
      const loginResult = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
      if (loginResult.status !== 'mfa_required') throw new Error('expected mfa_required')

      await expect(
        auth.completeWebAuthnRegistration(loginResult.ticket, {} as never),
      ).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
    })
  })

  describe('login', () => {
    it('issues discoverable-credential options (no allowCredentials) and a ticket with no user yet', async () => {
      const { auth } = await setup(NO_MFA_COLLECTIONS, Date.now, WEBAUTHN_CONFIG)
      const challenge = await auth.beginWebAuthnLogin()
      expect(challenge.options.allowCredentials).toEqual([])
      expect(challenge.ticket).toBeTruthy()
    })

    it('refuses a passkey nobody registered', async () => {
      const { auth } = await setup(NO_MFA_COLLECTIONS, Date.now, WEBAUTHN_CONFIG)
      const challenge = await auth.beginWebAuthnLogin()

      await expect(
        auth.completeWebAuthnLogin(challenge.ticket, { id: 'never-registered' } as never),
      ).rejects.toMatchObject({ code: 'AUTH_WEBAUTHN_FAILED' })
    })

    it('rejects an expired login ticket', async () => {
      let clock = 1_000_000_000
      const { auth } = await setup(NO_MFA_COLLECTIONS, () => clock, WEBAUTHN_CONFIG)
      const challenge = await auth.beginWebAuthnLogin()

      clock += 6 * 60 * 1000
      await expect(
        auth.completeWebAuthnLogin(challenge.ticket, { id: 'anything' } as never),
      ).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
    })

    it('refuses a registration-purpose ticket for completing a login', async () => {
      const { users, auth } = await setup(NO_MFA_COLLECTIONS, Date.now, WEBAUTHN_CONFIG)
      const user = await users.create({ email: 'alice@example.com', roles: ['viewer'] })
      const registration = await auth.beginWebAuthnRegistration(user.id)

      await expect(
        auth.completeWebAuthnLogin(registration.ticket, { id: 'anything' } as never),
      ).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
    })
  })
})

describe('sessionForVerifiedUser', () => {
  it('issues a session for an active user without checking a password', async () => {
    const { users, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'passkey@example.com', roles: ['viewer'] })

    const result = await auth.sessionForVerifiedUser(user.id)
    expect(result.status).toBe('session')
  })

  it('refuses a disabled or nonexistent user', async () => {
    const { users, auth } = await setup(NO_MFA_COLLECTIONS)
    const user = await users.create({ email: 'passkey@example.com', roles: ['viewer'] })
    await users.setStatus(user.id, 'disabled')

    await expect(auth.sessionForVerifiedUser(user.id)).rejects.toSatisfy(isCogentaError)
    await expect(auth.sessionForVerifiedUser('nonexistent')).rejects.toSatisfy(isCogentaError)
  })
})
