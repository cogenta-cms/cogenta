import { isCogentaError } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { createCredentialStore } from '../src/credentials.js'
import { createAuthService } from '../src/login.js'
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

  it('returns totp_setup_required for a sensitive role with no second factor set up', async () => {
    const { users, credentials, auth } = await setup(PUBLISH_COLLECTIONS)
    const user = await users.create({ email: 'ed@example.com', roles: ['editor'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    const result = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    expect(result.status).toBe('totp_setup_required')
    if (result.status === 'totp_setup_required') expect(result.ticket).toBeTruthy()
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

describe('TOTP self-service enrolment', () => {
  async function editorNeedingSetup() {
    const bundle = await setup(PUBLISH_COLLECTIONS)
    const user = await bundle.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await bundle.credentials.setPassword(user.id, 'correct horse battery staple')
    const result = await bundle.auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    if (result.status !== 'totp_setup_required') throw new Error('expected totp_setup_required')
    return { ...bundle, user, ticket: result.ticket }
  }

  it('generates a secret and an otpauth:// URI naming the account', async () => {
    const { auth, ticket, user } = await editorNeedingSetup()
    const enrolment = await auth.beginTotpSetup(ticket)

    expect(enrolment.secret.length).toBeGreaterThan(0)
    expect(enrolment.uri).toMatch(/^otpauth:\/\/totp\//)
    expect(decodeURIComponent(enrolment.uri)).toContain(user.email)
  })

  it('confirms with the right code and signs the user in', async () => {
    const { auth, ticket } = await editorNeedingSetup()
    const now = Math.floor(Date.now() / 1000)
    const enrolment = await auth.beginTotpSetup(ticket)

    const result = await auth.confirmTotpSetup(ticket, codeFor(enrolment.secret, now))
    expect(result.status).toBe('session')
  })

  it('leaves the account able to sign in normally afterwards, this time as mfa_required', async () => {
    const { auth, ticket } = await editorNeedingSetup()
    const now = Math.floor(Date.now() / 1000)
    const enrolment = await auth.beginTotpSetup(ticket)
    await auth.confirmTotpSetup(ticket, codeFor(enrolment.secret, now))

    const second = await auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    expect(second.status).toBe('mfa_required')
  })

  it('rejects the wrong code without confirming the secret', async () => {
    const { auth, ticket, credentials, user } = await editorNeedingSetup()
    await auth.beginTotpSetup(ticket)

    await expect(auth.confirmTotpSetup(ticket, '000000')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    })
    expect((await credentials.totpSecret(user.id))?.verified).toBe(false)
  })

  it('only the most recently requested secret can be confirmed', async () => {
    const { auth, ticket } = await editorNeedingSetup()
    const now = Math.floor(Date.now() / 1000)
    const first = await auth.beginTotpSetup(ticket)
    const second = await auth.beginTotpSetup(ticket)
    expect(second.secret).not.toBe(first.secret)

    await expect(auth.confirmTotpSetup(ticket, codeFor(first.secret, now))).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    })
    await expect(auth.confirmTotpSetup(ticket, codeFor(second.secret, now))).resolves.toMatchObject(
      {
        status: 'session',
      },
    )
  })

  it('refuses a login-purpose ticket for setup, and a setup-purpose ticket for login', async () => {
    const bundle = await setup(PUBLISH_COLLECTIONS)
    const user = await bundle.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await bundle.credentials.setPassword(user.id, 'correct horse battery staple')
    await bundle.credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
    await bundle.credentials.confirmTotp(user.id)

    // This account already has TOTP confirmed, so its ticket is a login one.
    const loginResult = await bundle.auth.passwordLogin(
      'ed@example.com',
      'correct horse battery staple',
    )
    if (loginResult.status !== 'mfa_required') throw new Error('expected mfa_required')

    await expect(bundle.auth.beginTotpSetup(loginResult.ticket)).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
    })

    const { auth, ticket } = await editorNeedingSetup()
    await expect(auth.totpLogin(ticket, '000000')).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
    })
  })

  it('rejects an expired setup ticket', async () => {
    let clock = 1_000_000_000
    const bundle = await setup(PUBLISH_COLLECTIONS, () => clock)
    const user = await bundle.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await bundle.credentials.setPassword(user.id, 'correct horse battery staple')
    const result = await bundle.auth.passwordLogin('ed@example.com', 'correct horse battery staple')
    if (result.status !== 'totp_setup_required') throw new Error('expected totp_setup_required')

    clock += 6 * 60 * 1000
    await expect(bundle.auth.beginTotpSetup(result.ticket)).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
    })
  })

  it('rate-limits repeated wrong confirmation codes', async () => {
    const { auth, ticket } = await editorNeedingSetup()
    await auth.beginTotpSetup(ticket)

    for (let i = 0; i < 5; i += 1) {
      await auth.confirmTotpSetup(ticket, '000000').catch(() => undefined)
    }
    await expect(auth.confirmTotpSetup(ticket, '000000')).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
    })
  })
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
