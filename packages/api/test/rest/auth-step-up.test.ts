import { createHmac } from 'node:crypto'
import { type AuthStore, createAuthStore } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAuthRouter } from '../../src/rest/auth-router.js'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'

/**
 * Pentest 2026-10-26, F-01 and F-03, at the HTTP boundary: a session alone no
 * longer changes or removes a second factor, a re-enrolment never touches the
 * active factor, and a sign-in ticket works once. These are the safe
 * counterparts of AUTH-REENROL, AUTH-NO-STEP-UP and AUTH-REPLAY in
 * `docs/qa/pentest-2026-10-26/reproduce-auth-findings.mjs`.
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

const PASSWORD = 'correct horse battery staple'
const SECRET = 'JBSWY3DPEHPK3PXP'
const T0 = Date.parse('2026-10-26T08:00:00Z')
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
    webauthn: WEBAUTHN_CONFIG,
    now: () => time,
  })
})

afterEach(async () => {
  await db.close()
})

function request(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): RestRequest {
  return {
    method,
    path,
    query: {},
    ...(options.body === undefined ? {} : { body: options.body }),
    headers: options.token === undefined ? {} : { authorization: `Bearer ${options.token}` },
  }
}

function errorCode(response: RestResponse): string | undefined {
  return (response.body as { error?: { code?: string } } | null)?.error?.code
}

/** A session whose sign-in is older than the five minutes a fresh sign-in counts as a re-authentication. */
async function agedSession(userId: string) {
  const kept = time
  time = T0 - 6 * 60 * 1000
  const session = await auth.sessions.create(userId)
  time = kept
  return session
}

/** An account, optionally with a confirmed TOTP factor, signed in on a fresh session. */
async function account(options: { totp: boolean }) {
  const user = await auth.users.create({ email: 'admin@example.com', roles: ['admin'] })
  await auth.credentials.setPassword(user.id, PASSWORD)
  if (options.totp) {
    await auth.credentials.setTotpSecret(user.id, SECRET)
    await auth.credentials.confirmTotp(user.id)
  }
  const session = await agedSession(user.id)
  return { user, token: session.token, router: createAuthRouter({ auth }) }
}

async function passwordLoginStatus(router: ReturnType<typeof createAuthRouter>): Promise<string> {
  const response = await router.handle(
    request('POST', '/api/auth/login', {
      body: { email: 'admin@example.com', password: PASSWORD },
    }),
  )
  return (response.body as { data: { status: string } }).data.status
}

describe('POST /api/auth/step-up', () => {
  it('requires a session', async () => {
    const { router } = await account({ totp: true })
    const response = await router.handle(
      request('POST', '/api/auth/step-up', { body: { password: PASSWORD } }),
    )
    expect(response.status).toBe(401)
  })

  it('accepts the current password and answers when the proof lapses', async () => {
    const { router, token } = await account({ totp: true })
    const response = await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { expiresAt: string } }
    expect(Date.parse(body.data.expiresAt)).toBe(T0 + 5 * 60 * 1000)
  })

  it('accepts a current authenticator code', async () => {
    const { router, token } = await account({ totp: true })
    const response = await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { code: codeFor(SECRET, time) } }),
    )
    expect(response.status).toBe(200)
  })

  it('refuses a wrong password and a wrong code without marking the session', async () => {
    const { router, token } = await account({ totp: true })
    const badPassword = await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: 'not-the-password' } }),
    )
    const badCode = await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { code: '000000' } }),
    )
    expect(badPassword.status).toBe(401)
    expect(badCode.status).toBe(401)

    const disable = await router.handle(request('DELETE', '/api/auth/totp', { token }))
    expect(errorCode(disable)).toBe('AUTH_STEP_UP_REQUIRED')
  })

  it('is refused for an API key, which is no one’s session', async () => {
    const { user, router } = await account({ totp: true })
    const key = await auth.apiKeys.create({ name: 'ci', scope: ['admin'], createdBy: user.id })
    const response = await router.handle(
      request('POST', '/api/auth/step-up', { token: key.key, body: { password: PASSWORD } }),
    )
    expect(response.status).toBe(401)
  })
})

describe('a session alone cannot replace or remove a confirmed factor (F-01)', () => {
  it('refuses to begin a re-enrolment, with a stable code and without touching the factor', async () => {
    const { user, router, token } = await account({ totp: true })

    const response = await router.handle(request('POST', '/api/auth/totp/enrol', { token }))

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('AUTH_STEP_UP_REQUIRED')
    expect(await auth.credentials.pendingTotp(user.id)).toBeNull()
    expect(await auth.credentials.totpSecret(user.id)).toEqual({ secret: SECRET, verified: true })
    expect(await passwordLoginStatus(router)).toBe('mfa_required')
  })

  it('keeps the account protected after a stepped-up re-enrolment is begun and abandoned', async () => {
    const { router, token } = await account({ totp: true })
    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )

    const begin = await router.handle(request('POST', '/api/auth/totp/enrol', { token }))

    expect(begin.status).toBe(200)
    expect(await passwordLoginStatus(router)).toBe('mfa_required')
  })

  it('swaps the factor only once the new code is confirmed', async () => {
    const { user, router, token } = await account({ totp: true })
    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )
    const begin = await router.handle(request('POST', '/api/auth/totp/enrol', { token }))
    const { secret } = (begin.body as { data: { secret: string } }).data

    const confirm = await router.handle(
      request('POST', '/api/auth/totp/enrol/confirm', {
        token,
        body: { token: codeFor(secret, time) },
      }),
    )

    expect(confirm.status).toBe(200)
    expect((await auth.credentials.totpSecret(user.id))?.secret).toBe(secret)
  })

  it('refuses to turn two-step verification off, and leaves it on', async () => {
    const { user, router, token } = await account({ totp: true })

    const response = await router.handle(request('DELETE', '/api/auth/totp', { token }))

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('AUTH_STEP_UP_REQUIRED')
    expect(await auth.credentials.totpSecret(user.id)).not.toBeNull()
    expect(await passwordLoginStatus(router)).toBe('mfa_required')
  })

  it('turns it off after a step-up, and the step-up lapses after five minutes', async () => {
    const { user, router, token } = await account({ totp: true })
    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )

    time = T0 + 5 * 60 * 1000 + 1
    const late = await router.handle(request('DELETE', '/api/auth/totp', { token }))
    expect(errorCode(late)).toBe('AUTH_STEP_UP_REQUIRED')
    expect(await auth.credentials.totpSecret(user.id)).not.toBeNull()

    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )
    const off = await router.handle(request('DELETE', '/api/auth/totp', { token }))
    expect(off.status).toBe(204)
    expect(await auth.credentials.totpSecret(user.id)).toBeNull()
  })

  it("does not let one session ride on another session's step-up", async () => {
    const { user, router, token } = await account({ totp: true })
    const other = await agedSession(user.id)
    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )

    const response = await router.handle(
      request('DELETE', '/api/auth/totp', { token: other.token }),
    )

    expect(errorCode(response)).toBe('AUTH_STEP_UP_REQUIRED')
  })

  it('refuses to regenerate recovery codes, and leaves the batch alone', async () => {
    const { router, token } = await account({ totp: true })
    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )
    const begin = await router.handle(request('POST', '/api/auth/totp/enrol', { token }))
    const { secret } = (begin.body as { data: { secret: string } }).data
    await router.handle(
      request('POST', '/api/auth/totp/enrol/confirm', {
        token,
        body: { token: codeFor(secret, time) },
      }),
    )
    time += 6 * 60 * 1000

    const refused = await router.handle(
      request('POST', '/api/auth/totp/recovery-codes/regenerate', { token }),
    )
    expect(errorCode(refused)).toBe('AUTH_STEP_UP_REQUIRED')
    const status = await router.handle(request('GET', '/api/auth/totp/recovery-codes', { token }))
    expect(status.body).toEqual({ data: { total: 10, remaining: 10 } })

    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )
    const allowed = await router.handle(
      request('POST', '/api/auth/totp/recovery-codes/regenerate', { token }),
    )
    expect(allowed.status).toBe(200)
  })

  it('refuses to add a passkey to an account that already has a factor, until a step-up', async () => {
    const { router, token } = await account({ totp: true })

    const refused = await router.handle(
      request('POST', '/api/auth/webauthn/register/begin', { token }),
    )
    expect(errorCode(refused)).toBe('AUTH_STEP_UP_REQUIRED')

    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )
    const allowed = await router.handle(
      request('POST', '/api/auth/webauthn/register/begin', { token }),
    )
    expect(allowed.status).toBe(200)
  })

  it('refuses the first authenticator on a password account to a session alone, then allows it after a step-up', async () => {
    const { user, router, token } = await account({ totp: false })

    const refused = await router.handle(request('POST', '/api/auth/totp/enrol', { token }))
    expect(refused.status).toBe(403)
    expect(errorCode(refused)).toBe('AUTH_STEP_UP_REQUIRED')
    expect(await auth.credentials.pendingTotp(user.id)).toBeNull()

    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )
    const begin = await router.handle(request('POST', '/api/auth/totp/enrol', { token }))
    expect(begin.status).toBe(200)
    const { secret } = (begin.body as { data: { secret: string } }).data
    const confirm = await router.handle(
      request('POST', '/api/auth/totp/enrol/confirm', {
        token,
        body: { token: codeFor(secret, time) },
      }),
    )
    expect(confirm.status).toBe(200)
  })

  it('refuses the first passkey on a password account to a session alone, then allows it after a step-up', async () => {
    const { router, token } = await account({ totp: false })

    const refused = await router.handle(
      request('POST', '/api/auth/webauthn/register/begin', { token }),
    )
    expect(refused.status).toBe(403)
    expect(errorCode(refused)).toBe('AUTH_STEP_UP_REQUIRED')

    await router.handle(
      request('POST', '/api/auth/step-up', { token, body: { password: PASSWORD } }),
    )
    const allowed = await router.handle(
      request('POST', '/api/auth/webauthn/register/begin', { token }),
    )
    expect(allowed.status).toBe(200)
  })

  it('leaves an account with no password and no factor to the session alone (MFA stays optional)', async () => {
    const user = await auth.users.create({ email: 'invitee@example.com', roles: ['editor'] })
    const session = await agedSession(user.id)
    const router = createAuthRouter({ auth })

    const passkey = await router.handle(
      request('POST', '/api/auth/webauthn/register/begin', { token: session.token }),
    )
    expect(passkey.status).toBe(200)
    const begin = await router.handle(
      request('POST', '/api/auth/totp/enrol', { token: session.token }),
    )
    expect(begin.status).toBe(200)
  })
})

describe('a passkey-only account steps up by signing in again', () => {
  async function passkeyOnly() {
    const user = await auth.users.create({ email: 'key@example.com', roles: ['admin'] })
    await auth.credentials.addWebAuthnCredential(user.id, {
      credentialId: 'cred-1',
      publicKey: 'key',
      counter: 0,
      transports: [],
      label: undefined,
    })
    return { user, router: createAuthRouter({ auth }) }
  }

  it('refuses a session older than five minutes, and accepts a session just created', async () => {
    const { user, router } = await passkeyOnly()
    const old = await agedSession(user.id)
    const refused = await router.handle(
      request('POST', '/api/auth/webauthn/register/begin', { token: old.token }),
    )
    expect(errorCode(refused)).toBe('AUTH_STEP_UP_REQUIRED')

    const fresh = await auth.sessions.create(user.id)
    const allowed = await router.handle(
      request('POST', '/api/auth/webauthn/register/begin', { token: fresh.token }),
    )
    expect(allowed.status).toBe(200)
  })

  it('stops counting a sign-in as fresh once five minutes have passed', async () => {
    const { user, router } = await passkeyOnly()
    const session = await auth.sessions.create(user.id)
    time += 5 * 60 * 1000 + 1
    const refused = await router.handle(
      request('POST', '/api/auth/webauthn/register/begin', { token: session.token }),
    )
    expect(errorCode(refused)).toBe('AUTH_STEP_UP_REQUIRED')
  })
})

describe('a sign-in ticket and a TOTP code work once (F-03)', () => {
  it('turns one ticket and one code into one session, then refuses the replay', async () => {
    const { user, router } = await account({ totp: true })
    const login = await router.handle(
      request('POST', '/api/auth/login', {
        body: { email: 'admin@example.com', password: PASSWORD },
      }),
    )
    const { ticket } = (login.body as { data: { ticket: string } }).data
    const code = codeFor(SECRET, time)

    const first = await router.handle(
      request('POST', '/api/auth/totp', { body: { ticket, token: code } }),
    )
    const replay = await router.handle(
      request('POST', '/api/auth/totp', { body: { ticket, token: code } }),
    )

    expect(first.status).toBe(200)
    expect(replay.status).toBe(401)

    time += 30_000
    const later = await router.handle(
      request('POST', '/api/auth/totp', { body: { ticket, token: codeFor(SECRET, time) } }),
    )
    expect(later.status).toBe(401)
    // The fixture's own session plus the single one the first call created.
    expect(await auth.sessions.list(user.id)).toHaveLength(2)
  })
})
