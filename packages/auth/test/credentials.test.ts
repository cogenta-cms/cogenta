import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createCredentialStore, type WebAuthnCredentialData } from '../src/credentials.js'
import { hashRecoveryCode } from '../src/recovery-codes.js'
import { testDb } from './helpers/db.js'

const PASSKEY: WebAuthnCredentialData = {
  credentialId: 'cred-1',
  publicKey: 'base64url-public-key',
  counter: 0,
  transports: ['internal'],
  label: 'YubiKey',
}

describe('CredentialStore — password', () => {
  it('sets and verifies a password', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)

    await credentials.setPassword('user-1', 'correct horse battery staple')
    expect(await credentials.verifyPassword('user-1', 'correct horse battery staple')).toBe(true)
    expect(await credentials.verifyPassword('user-1', 'wrong')).toBe(false)
  })

  it('reports hasPassword accurately', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    expect(await credentials.hasPassword('user-1')).toBe(false)

    await credentials.setPassword('user-1', 'x'.repeat(12))
    expect(await credentials.hasPassword('user-1')).toBe(true)
  })

  it('replaces an existing password rather than adding a second row', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)

    await credentials.setPassword('user-1', 'first-password-here')
    await credentials.setPassword('user-1', 'second-password-here')

    expect(await credentials.verifyPassword('user-1', 'first-password-here')).toBe(false)
    expect(await credentials.verifyPassword('user-1', 'second-password-here')).toBe(true)
    expect(await credentials.kinds('user-1')).toEqual(['password'])
  })

  it('fails verification for a user with no password set, rather than throwing', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    expect(await credentials.verifyPassword('nobody', 'anything')).toBe(false)
  })
})

describe('CredentialStore — TOTP', () => {
  it('starts unverified after setTotpSecret', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)

    await credentials.setTotpSecret('user-1', 'JBSWY3DPEHPK3PXP')
    expect(await credentials.totpSecret('user-1')).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      verified: false,
    })
  })

  it('flips to verified after confirmTotp', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)

    await credentials.setTotpSecret('user-1', 'JBSWY3DPEHPK3PXP')
    await credentials.confirmTotp('user-1')
    expect((await credentials.totpSecret('user-1'))?.verified).toBe(true)
  })

  it('refuses to confirm a TOTP secret that was never set up', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    await expect(credentials.confirmTotp('user-1')).rejects.toBeInstanceOf(CogentaError)
  })

  it('removes a TOTP secret', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)

    await credentials.setTotpSecret('user-1', 'JBSWY3DPEHPK3PXP')
    await credentials.removeTotp('user-1')
    expect(await credentials.totpSecret('user-1')).toBeNull()
  })

  it('reports null for a user with no TOTP secret', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    expect(await credentials.totpSecret('user-1')).toBeNull()
  })
})

describe('CredentialStore — WebAuthn', () => {
  it('adds a passkey and lists it back', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)

    await credentials.addWebAuthnCredential('user-1', PASSKEY)
    expect(await credentials.webAuthnCredentials('user-1')).toEqual([PASSKEY])
  })

  it('supports more than one passkey per user', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    const second: WebAuthnCredentialData = { ...PASSKEY, credentialId: 'cred-2', label: 'Phone' }

    await credentials.addWebAuthnCredential('user-1', PASSKEY)
    await credentials.addWebAuthnCredential('user-1', second)

    const list = await credentials.webAuthnCredentials('user-1')
    expect(list.map((c) => c.credentialId).sort()).toEqual(['cred-1', 'cred-2'])
  })

  it('finds a credential by its external (wire) id, across users', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    await credentials.addWebAuthnCredential('user-1', PASSKEY)

    const found = await credentials.webAuthnCredentialByExternalId('cred-1')
    expect(found?.userId).toBe('user-1')
    expect(found?.data).toEqual(PASSKEY)
  })

  it('returns null for an unknown external credential id', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    expect(await credentials.webAuthnCredentialByExternalId('does-not-exist')).toBeNull()
  })

  it('updates the stored counter, refusing a cloned-authenticator replay downstream', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    await credentials.addWebAuthnCredential('user-1', PASSKEY)

    await credentials.updateWebAuthnCounter('cred-1', 7)
    const found = await credentials.webAuthnCredentialByExternalId('cred-1')
    expect(found?.data.counter).toBe(7)
  })

  it('reports every credential kind a user has set up', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)

    await credentials.setPassword('user-1', 'x'.repeat(12))
    await credentials.setTotpSecret('user-1', 'JBSWY3DPEHPK3PXP')
    await credentials.addWebAuthnCredential('user-1', PASSKEY)

    expect([...(await credentials.kinds('user-1'))].sort()).toEqual([
      'password',
      'totp',
      'webauthn',
    ])
  })

  it('reports no kinds for an unknown user', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    expect(await credentials.kinds('nobody')).toEqual([])
  })
})

// Fiche 18 task 1. `login.ts`'s tests cover the end-to-end sign-in flow; this
// is the storage layer on its own — hashed like a password, single-use, and
// scoped to the account that owns them.
describe('CredentialStore — recovery codes', () => {
  it('reports null for an account that was never issued any', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    expect(await credentials.recoveryCodesStatus('user-1')).toBeNull()
  })

  it('stores a batch as hashes, all unused, and reports the count', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    const hashes = await Promise.all(
      ['CODE1-AAAAA', 'CODE2-BBBBB', 'CODE3-CCCCC'].map((code) => hashRecoveryCode(code)),
    )
    await credentials.setRecoveryCodes('user-1', hashes)

    expect(await credentials.recoveryCodesStatus('user-1')).toEqual({ total: 3, remaining: 3 })
  })

  it('consumes exactly the matching code and decrements what remains', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    const hashes = await Promise.all(
      ['CODE1-AAAAA', 'CODE2-BBBBB'].map((code) => hashRecoveryCode(code)),
    )
    await credentials.setRecoveryCodes('user-1', hashes)

    expect(await credentials.consumeRecoveryCode('user-1', 'CODE1-AAAAA')).toBe(true)
    expect(await credentials.recoveryCodesStatus('user-1')).toEqual({ total: 2, remaining: 1 })
    // The other code still works — consuming one never touches its siblings.
    expect(await credentials.consumeRecoveryCode('user-1', 'CODE2-BBBBB')).toBe(true)
    expect(await credentials.recoveryCodesStatus('user-1')).toEqual({ total: 2, remaining: 0 })
  })

  it('refuses the same code a second time', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    await credentials.setRecoveryCodes('user-1', [await hashRecoveryCode('CODE1-AAAAA')])

    expect(await credentials.consumeRecoveryCode('user-1', 'CODE1-AAAAA')).toBe(true)
    expect(await credentials.consumeRecoveryCode('user-1', 'CODE1-AAAAA')).toBe(false)
  })

  it('is case- and dash-insensitive, like the plaintext code was normalised before hashing', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    await credentials.setRecoveryCodes('user-1', [await hashRecoveryCode('CODE1-AAAAA')])

    expect(await credentials.consumeRecoveryCode('user-1', 'code1aaaaa')).toBe(true)
  })

  it('rejects an unknown code without throwing', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    await credentials.setRecoveryCodes('user-1', [await hashRecoveryCode('CODE1-AAAAA')])
    expect(await credentials.consumeRecoveryCode('user-1', 'NEVER-ISSUED')).toBe(false)
  })

  it('never touches another user’s codes', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    await credentials.setRecoveryCodes('user-1', [await hashRecoveryCode('CODE1-AAAAA')])
    expect(await credentials.consumeRecoveryCode('user-2', 'CODE1-AAAAA')).toBe(false)
  })

  it('regenerating replaces the batch wholesale, invalidating the old codes', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    await credentials.setRecoveryCodes('user-1', [await hashRecoveryCode('OLD01-AAAAA')])
    await credentials.setRecoveryCodes('user-1', [await hashRecoveryCode('NEW01-BBBBB')])

    expect(await credentials.consumeRecoveryCode('user-1', 'OLD01-AAAAA')).toBe(false)
    expect(await credentials.consumeRecoveryCode('user-1', 'NEW01-BBBBB')).toBe(true)
  })

  it('removeRecoveryCodes clears the batch entirely', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)
    await credentials.setRecoveryCodes('user-1', [await hashRecoveryCode('CODE1-AAAAA')])

    await credentials.removeRecoveryCodes('user-1')
    expect(await credentials.recoveryCodesStatus('user-1')).toBeNull()
    expect(await credentials.consumeRecoveryCode('user-1', 'CODE1-AAAAA')).toBe(false)
  })
})
