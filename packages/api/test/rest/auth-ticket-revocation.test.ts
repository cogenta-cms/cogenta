import { createHmac } from 'node:crypto'
import { type AuthStore, createAuthStore } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAuthRouter } from '../../src/rest/auth-router.js'
import type { RestRequest } from '../../src/rest/http.js'
import { createUsersRouter } from '../../src/rest/users-router.js'

/**
 * Pentest 2026-11-01, AUTH-01: a sign-in ticket (second factor, or passkey
 * registration) handed out with the *old* password must not survive a change
 * of that password, a disabled account, or any other event that revokes the
 * sessions. Revoking sessions while leaving these alive let whoever held a
 * ticket and a code mint a brand-new session after the incident response.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Independent RFC 6238 implementation — see packages/auth/test/helpers/totp-code.ts for why. */
function codeFor(secret: string, nowMs: number): string {
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of secret.toUpperCase()) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / 30_000)))
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
  const offset = (digest.at(-1) ?? 0) & 0x0f
  const truncated =
    ((digest[offset] ?? 0) & 0x7f) * 2 ** 24 +
    ((digest[offset + 1] ?? 0) & 0xff) * 2 ** 16 +
    ((digest[offset + 2] ?? 0) & 0xff) * 2 ** 8 +
    ((digest[offset + 3] ?? 0) & 0xff)
  return String(truncated % 1_000_000).padStart(6, '0')
}

const OLD_PASSWORD = 'correct horse battery staple'
const NEW_PASSWORD = 'a brand new long passphrase'
const SECRET = 'JBSWY3DPEHPK3PXP'
const T0 = Date.parse('2026-11-01T08:00:00Z')
const WEBAUTHN_CONFIG = {
  relyingPartyName: 'Cogenta Test',
  relyingPartyId: 'example.com',
  origin: 'https://example.com',
}

let db: DatabaseHandle
let auth: AuthStore
let time: number

beforeEach(async () => {
  time = T0
  db = await createSqliteHandle({ url: ':memory:' })
  auth = await createAuthStore({
    db,
    signingKey: 'test-signing-key-not-a-real-secret',
    collections: [],
    now: () => time,
    webauthn: WEBAUTHN_CONFIG,
  })
})

afterEach(async () => {
  await db.close()
})

function post(path: string, body: unknown): RestRequest {
  return { method: 'POST', path, query: {}, body }
}

async function accountWithTotp() {
  const user = await auth.users.create({ email: 'mfa@example.com', roles: ['editor'] })
  await auth.credentials.setPassword(user.id, OLD_PASSWORD)
  await auth.credentials.setTotpSecret(user.id, SECRET)
  await auth.credentials.confirmTotp(user.id)
  return user
}

async function mfaTicket(email: string, password: string): Promise<string> {
  const result = await auth.login.passwordLogin(email, password)
  if (result.status !== 'mfa_required')
    throw new Error(`expected an MFA challenge: ${result.status}`)
  return result.ticket
}

const FORGED_ATTESTATION = {
  id: 'forged',
  rawId: 'forged',
  type: 'public-key' as const,
  clientExtensionResults: {},
  response: {
    clientDataJSON: Buffer.from('{}').toString('base64url'),
    attestationObject: Buffer.from('not-real-cbor').toString('base64url'),
  },
}

describe('a password reset', () => {
  it('voids an MFA ticket issued with the old password, even with a valid code', async () => {
    const user = await accountWithTotp()
    const oldTicket = await mfaTicket(user.email, OLD_PASSWORD)

    const reset = await auth.resets.issue(user.id)
    const response = await createAuthRouter({ auth }).handle(
      post('/api/auth/reset-password', { token: reset.token, newPassword: NEW_PASSWORD }),
    )
    expect(response.status).toBe(200)

    await expect(auth.login.totpLogin(oldTicket, codeFor(SECRET, time))).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
    })
  })

  it('still lets a ticket issued with the new password complete the sign-in', async () => {
    const user = await accountWithTotp()
    const reset = await auth.resets.issue(user.id)
    await createAuthRouter({ auth }).handle(
      post('/api/auth/reset-password', { token: reset.token, newPassword: NEW_PASSWORD }),
    )

    const freshTicket = await mfaTicket(user.email, NEW_PASSWORD)
    const result = await auth.login.totpLogin(freshTicket, codeFor(SECRET, time))
    expect(result.status).toBe('session')
  })

  it('voids a passkey registration ticket obtained before it', async () => {
    const user = await accountWithTotp()
    const { ticket } = await auth.login.beginWebAuthnRegistration(user.id)

    const reset = await auth.resets.issue(user.id)
    await createAuthRouter({ auth }).handle(
      post('/api/auth/reset-password', { token: reset.token, newPassword: NEW_PASSWORD }),
    )

    // Refused as an invalid ticket, not merely as a bad attestation.
    await expect(
      auth.login.completeWebAuthnRegistration(ticket, FORGED_ATTESTATION),
    ).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
  })
})

describe('a voluntary password change', () => {
  async function changePassword(userId: string): Promise<number> {
    const response = await createUsersRouter({ auth, now: () => time }).handle(
      post('/api/users/me/password', { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }),
      { id: userId, roles: ['editor'] },
    )
    return response.status
  }

  it('voids an MFA ticket issued with the old password, even with a valid code', async () => {
    const user = await accountWithTotp()
    const oldTicket = await mfaTicket(user.email, OLD_PASSWORD)

    expect(await changePassword(user.id)).toBe(200)

    await expect(auth.login.totpLogin(oldTicket, codeFor(SECRET, time))).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
    })
  })

  it('voids a passkey registration ticket obtained before it', async () => {
    const user = await accountWithTotp()
    const { ticket } = await auth.login.beginWebAuthnRegistration(user.id)

    expect(await changePassword(user.id)).toBe(200)

    await expect(
      auth.login.completeWebAuthnRegistration(ticket, FORGED_ATTESTATION),
    ).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' })
  })
})

describe('disabling an account', () => {
  it('voids its pending sign-in tickets, so re-enabling it does not resurrect them', async () => {
    const admin = await auth.users.create({ email: 'admin@example.com', roles: ['admin'] })
    const user = await accountWithTotp()
    const oldTicket = await mfaTicket(user.email, OLD_PASSWORD)

    const users = createUsersRouter({ auth, now: () => time })
    const actor = { id: admin.id, roles: ['admin'] }
    const patch = (status: string): RestRequest => ({
      method: 'PATCH',
      path: `/api/users/${user.id}`,
      query: {},
      body: { status },
    })
    expect((await users.handle(patch('disabled'), actor)).status).toBe(200)
    expect((await users.handle(patch('active'), actor)).status).toBe(200)

    await expect(auth.login.totpLogin(oldTicket, codeFor(SECRET, time))).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
    })
  })
})
