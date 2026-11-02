import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createCredentialStore } from '../src/credentials.js'
import { createAuthService } from '../src/login.js'
import { TABLES } from '../src/tables.js'
import { createUserStore } from '../src/users.js'
import { testDb } from './helpers/db.js'
import { codeFor } from './helpers/totp-code.js'

/**
 * Pentest 2026-11-01, AUTH-03: a TOTP secret in the database let anyone with
 * a copy of it (a dump, a backup) compute every future code. It is encrypted
 * now, with a key derived from the site signing key.
 */

const KEY = 'test-signing-key-not-a-real-secret'
const SECRET = 'JBSWY3DPEHPK3PXP'
const T0 = Date.parse('2026-11-01T08:00:00Z')

async function rawRows(
  db: DatabaseHandle,
  userId: string,
): Promise<{ kind: string; data: string }[]> {
  const result = await db.query<{ kind: string; data: string }>(
    sql`select kind, data from ${identifier(TABLES.credentials, db.dialect)} where user_id = ${userId}`,
  )
  return result.rows
}

describe('authenticator secrets at rest', () => {
  it('never put the secret of an active factor in the row', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db, Date.now, { signingKey: KEY })

    await credentials.setTotpSecret('user-1', SECRET)
    await credentials.confirmTotp('user-1')

    const rows = await rawRows(db, 'user-1')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.data).not.toContain(SECRET)
    expect(await credentials.totpSecret('user-1')).toEqual({ secret: SECRET, verified: true })
  })

  it('never put the secret of a pending enrolment in the row', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db, Date.now, { signingKey: KEY })

    await credentials.setPendingTotp('user-1', SECRET, Date.now() + 60_000)

    expect((await rawRows(db, 'user-1'))[0]?.data).not.toContain(SECRET)
    expect((await credentials.pendingTotp('user-1'))?.secret).toBe(SECRET)
  })

  it('keeps the secret out of the row through promotion and a claimed step', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db, Date.now, { signingKey: KEY })
    await credentials.setPendingTotp('user-1', SECRET, Date.now() + 60_000)

    expect(await credentials.promotePendingTotp('user-1', SECRET, 5)).toBe(true)
    expect(await credentials.claimTotpStep('user-1', 6)).toBe(true)
    expect(await credentials.claimTotpStep('user-1', 6)).toBe(false)

    for (const row of await rawRows(db, 'user-1')) expect(row.data).not.toContain(SECRET)
    expect(await credentials.totpSecret('user-1')).toEqual({ secret: SECRET, verified: true })
  })

  it('encrypts the same secret differently every time', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db, Date.now, { signingKey: KEY })

    await credentials.setTotpSecret('user-1', SECRET)
    const first = (await rawRows(db, 'user-1'))[0]?.data
    await credentials.setTotpSecret('user-1', SECRET)
    const second = (await rawRows(db, 'user-1'))[0]?.data

    expect(first).not.toBe(second)
  })

  it('still lets a person enrol and sign in with an authenticator code', async () => {
    const db = await testDb()
    let time = T0
    const users = createUserStore(db, () => time)
    const credentials = createCredentialStore(db, () => time, { signingKey: KEY })
    const auth = createAuthService({
      db,
      signingKey: KEY,
      collections: [],
      now: () => time,
    })
    const user = await users.create({ email: 'mfa@example.com', roles: ['editor'] })
    await credentials.setPassword(user.id, 'correct horse battery staple')

    const setup = await auth.beginTotpEnrolment(user.id)
    await auth.confirmTotpEnrolment(user.id, codeFor(setup.secret, time / 1000))
    time += 60_000

    const challenge = await auth.passwordLogin(user.email, 'correct horse battery staple')
    if (challenge.status !== 'mfa_required') throw new Error('expected an MFA challenge')
    const result = await auth.totpLogin(challenge.ticket, codeFor(setup.secret, time / 1000))

    expect(result.status).toBe('session')
    for (const row of await rawRows(db, user.id)) expect(row.data).not.toContain(setup.secret)
  })

  it('reads a legacy plaintext row and encrypts it the next time it is read', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db, Date.now, { signingKey: KEY })
    await db.query(sql`
      insert into ${identifier(TABLES.credentials, db.dialect)} (id, user_id, kind, data, created_at)
      values (${'legacy'}, ${'user-1'}, ${'totp'}, ${JSON.stringify({ secret: SECRET, verified: true })}, ${new Date().toISOString()})`)

    expect(await credentials.totpSecret('user-1')).toEqual({ secret: SECRET, verified: true })

    const rows = await rawRows(db, 'user-1')
    expect(rows[0]?.data).not.toContain(SECRET)
    expect(await credentials.totpSecret('user-1')).toEqual({ secret: SECRET, verified: true })
  })

  it('re-encrypts a legacy row when a code is accepted against it', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db, Date.now, { signingKey: KEY })
    await db.query(sql`
      insert into ${identifier(TABLES.credentials, db.dialect)} (id, user_id, kind, data, created_at)
      values (${'legacy'}, ${'user-1'}, ${'totp'}, ${JSON.stringify({ secret: SECRET, verified: true, lastStep: 1 })}, ${new Date().toISOString()})`)

    expect(await credentials.claimTotpStep('user-1', 2)).toBe(true)

    expect((await rawRows(db, 'user-1'))[0]?.data).not.toContain(SECRET)
    expect(await credentials.claimTotpStep('user-1', 2)).toBe(false)
  })

  it('fails closed when the key is not the one the secret was written with', async () => {
    const db = await testDb()
    await createCredentialStore(db, Date.now, { signingKey: KEY }).setTotpSecret('user-1', SECRET)

    const wrong = createCredentialStore(db, Date.now, { signingKey: 'another-signing-key' })

    await expect(wrong.totpSecret('user-1')).rejects.toMatchObject({
      code: 'AUTH_CREDENTIAL_KEY_INVALID',
    })
  })

  it('refuses to read an encrypted secret when no key was given', async () => {
    const db = await testDb()
    await createCredentialStore(db, Date.now, { signingKey: KEY }).setTotpSecret('user-1', SECRET)

    await expect(createCredentialStore(db).totpSecret('user-1')).rejects.toMatchObject({
      code: 'AUTH_CREDENTIAL_KEY_INVALID',
    })
  })

  it('refuses to store a secret when no key was given, rather than storing it in clear', async () => {
    const db = await testDb()
    const keyless = createCredentialStore(db)

    await expect(keyless.setTotpSecret('user-1', SECRET)).rejects.toMatchObject({
      code: 'AUTH_CREDENTIAL_KEY_INVALID',
    })
    await expect(keyless.setPendingTotp('user-1', SECRET, Date.now() + 1000)).rejects.toMatchObject(
      { code: 'AUTH_CREDENTIAL_KEY_INVALID' },
    )
    expect(await rawRows(db, 'user-1')).toEqual([])
  })

  it('does not open a ciphertext copied onto another account', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db, Date.now, { signingKey: KEY })
    await credentials.setTotpSecret('victim', SECRET)
    const stolen = (await rawRows(db, 'victim'))[0]?.data as string
    await db.query(sql`
      insert into ${identifier(TABLES.credentials, db.dialect)} (id, user_id, kind, data, created_at)
      values (${'planted'}, ${'attacker'}, ${'totp'}, ${stolen}, ${new Date().toISOString()})`)

    await expect(credentials.totpSecret('attacker')).rejects.toMatchObject({
      code: 'AUTH_CREDENTIAL_KEY_INVALID',
    })
  })

  it('leaves passwords and passkeys working without a key', async () => {
    const db = await testDb()
    const credentials = createCredentialStore(db)

    await credentials.setPassword('user-1', 'correct horse battery staple')

    expect(await credentials.verifyPassword('user-1', 'correct horse battery staple')).toBe(true)
  })
})
