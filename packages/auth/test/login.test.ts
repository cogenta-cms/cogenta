import { isCogentaError } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { createCredentialStore } from '../src/credentials.js'
import { createAuthService } from '../src/login.js'
import { verifyTotp } from '../src/totp.js'
import { createUserStore } from '../src/users.js'
import { testDb } from './helpers/db.js'

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

async function setup(collections: readonly CollectionDefinition[], now: () => number = Date.now) {
  const db = await testDb()
  const users = createUserStore(db, now)
  const credentials = createCredentialStore(db, now)
  const auth = createAuthService({ db, signingKey: SIGNING_KEY, collections, now })
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

  it('refuses to sign in a sensitive role with no second factor set up', async () => {
    const { users, credentials, auth } = await setup(PUBLISH_COLLECTIONS)
    const user = await users.create({ email: 'ed@example.com', roles: ['editor'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    await expect(
      auth.passwordLogin('ed@example.com', 'correct horse battery staple'),
    ).rejects.toMatchObject({ code: 'AUTH_MFA_REQUIRED' })
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

  function codeFor(secret: string, now: number): string {
    // Brute-force the 6-digit code for a fixed instant — the same trick used to
    // avoid depending on totp.ts internals in totp.test.ts, kept local here so
    // this file does not need to know the secret's RFC vector by heart.
    for (let n = 0; n <= 999_999; n += 1) {
      const candidate = String(n).padStart(6, '0')
      if (verifyTotp(candidate, secret, { now, windowSteps: 0 })) return candidate
    }
    throw new Error('no candidate matched — should be unreachable in a test')
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
