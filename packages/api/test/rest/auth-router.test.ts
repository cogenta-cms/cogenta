import { createHmac } from 'node:crypto'
import { type AuthStore, createAuthStore } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAuthRouter, resolveActor } from '../../src/rest/auth-router.js'
import type { RestRequest } from '../../src/rest/http.js'
import { ANONYMOUS } from '../../src/types.js'

const PUBLISH_COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {},
    permissions: { publish: ['editor'] },
  },
]

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Independent RFC 6238 implementation — see packages/auth/test/helpers/totp-code.ts for why. */
function codeFor(secret: string, nowSeconds: number): string {
  const normalised = secret.toUpperCase().replace(/=+$/u, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of normalised) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  const key = Buffer.from(bytes)

  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(nowSeconds / 30)))
  const digest = createHmac('sha1', key).update(counter).digest()
  const offset = (digest.at(-1) ?? 0) & 0x0f
  const truncated =
    ((digest[offset] ?? 0) & 0x7f) * 2 ** 24 +
    ((digest[offset + 1] ?? 0) & 0xff) * 2 ** 16 +
    ((digest[offset + 2] ?? 0) & 0xff) * 2 ** 8 +
    ((digest[offset + 3] ?? 0) & 0xff)
  return String(truncated % 1_000_000).padStart(6, '0')
}

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'
const WEBAUTHN_CONFIG = {
  relyingPartyName: 'Cogenta Test',
  relyingPartyId: 'example.com',
  origin: 'https://example.com',
}

let db: DatabaseHandle
let auth: AuthStore

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  auth = await createAuthStore({ db, signingKey: SIGNING_KEY, collections: [] })
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

async function createLoggedInUser(email: string, password: string) {
  const user = await auth.users.create({ email, roles: ['viewer'] })
  await auth.credentials.setPassword(user.id, password)
  return user
}

describe('POST /api/auth/login', () => {
  it('issues a session for a correct password', async () => {
    const router = createAuthRouter({ auth })
    await createLoggedInUser('alice@example.com', 'correct horse battery staple')

    const response = await router.handle(
      request('POST', '/api/auth/login', {
        body: { email: 'alice@example.com', password: 'correct horse battery staple' },
      }),
    )

    expect(response.status).toBe(200)
    const body = response.body as { data: { status: string; session?: { token: string } } }
    expect(body.data.status).toBe('session')
    expect(body.data.session?.token).toBeTruthy()
  })

  it('refuses a wrong password with 401', async () => {
    const router = createAuthRouter({ auth })
    await createLoggedInUser('alice@example.com', 'correct horse battery staple')

    const response = await router.handle(
      request('POST', '/api/auth/login', {
        body: { email: 'alice@example.com', password: 'nope' },
      }),
    )

    expect(response.status).toBe(401)
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'AUTH_INVALID_CREDENTIALS',
    )
  })

  it('rejects a malformed body with 400, never a raw crash', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(request('POST', '/api/auth/login', { body: { email: 1 } }))
    expect(response.status).toBe(400)
  })

  it('refuses GET on the login route', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(request('GET', '/api/auth/login'))
    expect(response.status).toBe(405)
  })
})

describe('GET /api/auth/session', () => {
  it('reports the signed-in user for a valid token', async () => {
    const router = createAuthRouter({ auth })
    const user = await createLoggedInUser('alice@example.com', 'correct horse battery staple')
    const session = await auth.sessions.create(user.id)

    const response = await router.handle(
      request('GET', '/api/auth/session', { token: session.token }),
    )

    expect(response.status).toBe(200)
    expect((response.body as { data: { id: string } }).data.id).toBe(user.id)
  })

  it('refuses a missing token with 401', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(request('GET', '/api/auth/session'))
    expect(response.status).toBe(401)
    expect((response.body as { error: { code: string } }).error.code).toBe('AUTH_SESSION_INVALID')
  })

  it('refuses a bogus token with 401', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(
      request('GET', '/api/auth/session', { token: 'not-a-real-token' }),
    )
    expect(response.status).toBe(401)
  })
})

describe('DELETE /api/auth/session', () => {
  it('revokes the session, so it no longer resolves', async () => {
    const router = createAuthRouter({ auth })
    const user = await createLoggedInUser('alice@example.com', 'correct horse battery staple')
    const session = await auth.sessions.create(user.id)

    const revoke = await router.handle(
      request('DELETE', '/api/auth/session', { token: session.token }),
    )
    expect(revoke.status).toBe(204)

    const check = await router.handle(request('GET', '/api/auth/session', { token: session.token }))
    expect(check.status).toBe(401)
  })

  it('is a no-op, not an error, when there is nothing to revoke', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(request('DELETE', '/api/auth/session'))
    expect(response.status).toBe(204)
  })
})

describe('TOTP self-service enrolment', () => {
  async function editorNeedingSetup() {
    const db_ = await createSqliteHandle({ url: ':memory:' })
    const authWithMfa = await createAuthStore({
      db: db_,
      signingKey: SIGNING_KEY,
      collections: PUBLISH_COLLECTIONS,
    })
    const user = await authWithMfa.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await authWithMfa.credentials.setPassword(user.id, 'correct horse battery staple')
    const router = createAuthRouter({ auth: authWithMfa })

    const login = await router.handle(
      request('POST', '/api/auth/login', {
        body: { email: 'ed@example.com', password: 'correct horse battery staple' },
      }),
    )
    const body = login.body as { data: { status: string; ticket: string } }
    if (body.data.status !== 'totp_setup_required') throw new Error('expected totp_setup_required')

    return { db: db_, auth: authWithMfa, router, ticket: body.data.ticket, user }
  }

  it('returns totp_setup_required from login for a role with no factor yet', async () => {
    const { db: db_, router } = await editorNeedingSetup()
    try {
      const login = await router.handle(
        request('POST', '/api/auth/login', {
          body: { email: 'ed@example.com', password: 'correct horse battery staple' },
        }),
      )
      expect(login.status).toBe(200)
      const body = login.body as { data: { status: string; ticket: string } }
      expect(body.data.status).toBe('totp_setup_required')
      expect(body.data.ticket).toBeTruthy()
    } finally {
      await db_.close()
    }
  })

  it('begins enrolment with a secret and a QR-ready URI', async () => {
    const { db: db_, router, ticket } = await editorNeedingSetup()
    try {
      const response = await router.handle(
        request('POST', '/api/auth/totp-setup', { body: { ticket } }),
      )
      expect(response.status).toBe(200)
      const body = response.body as { data: { secret: string; uri: string } }
      expect(body.data.secret.length).toBeGreaterThan(0)
      expect(body.data.uri).toMatch(/^otpauth:\/\/totp\//)
    } finally {
      await db_.close()
    }
  })

  it('confirms with the right code and returns a session', async () => {
    const { db: db_, router, ticket, user } = await editorNeedingSetup()
    try {
      const now = Math.floor(Date.now() / 1000)
      const begin = await router.handle(
        request('POST', '/api/auth/totp-setup', { body: { ticket } }),
      )
      const { secret } = (begin.body as { data: { secret: string } }).data

      const confirm = await router.handle(
        request('POST', '/api/auth/totp-setup-confirm', {
          body: { ticket, token: codeFor(secret, now) },
        }),
      )
      expect(confirm.status).toBe(200)
      const body = confirm.body as { data: { status: string; user: { id: string } } }
      expect(body.data.status).toBe('session')
      expect(body.data.user.id).toBe(user.id)
    } finally {
      await db_.close()
    }
  })

  it('rejects the wrong confirmation code with 401', async () => {
    const { db: db_, router, ticket } = await editorNeedingSetup()
    try {
      await router.handle(request('POST', '/api/auth/totp-setup', { body: { ticket } }))
      const response = await router.handle(
        request('POST', '/api/auth/totp-setup-confirm', { body: { ticket, token: '000000' } }),
      )
      expect(response.status).toBe(401)
    } finally {
      await db_.close()
    }
  })

  it('refuses a login-purpose ticket on the setup routes', async () => {
    const db_ = await createSqliteHandle({ url: ':memory:' })
    try {
      const authWithMfa = await createAuthStore({
        db: db_,
        signingKey: SIGNING_KEY,
        collections: PUBLISH_COLLECTIONS,
      })
      const user = await authWithMfa.users.create({ email: 'ed@example.com', roles: ['editor'] })
      await authWithMfa.credentials.setPassword(user.id, 'correct horse battery staple')
      await authWithMfa.credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
      await authWithMfa.credentials.confirmTotp(user.id)
      const router = createAuthRouter({ auth: authWithMfa })

      const login = await router.handle(
        request('POST', '/api/auth/login', {
          body: { email: 'ed@example.com', password: 'correct horse battery staple' },
        }),
      )
      const { ticket } = (login.body as { data: { ticket: string } }).data

      const response = await router.handle(
        request('POST', '/api/auth/totp-setup', { body: { ticket } }),
      )
      expect(response.status).toBe(401)
      expect((response.body as { error: { code: string } }).error.code).toBe('AUTH_SESSION_INVALID')
    } finally {
      await db_.close()
    }
  })
})

describe('WebAuthn passkeys', () => {
  async function withWebauthn() {
    const db_ = await createSqliteHandle({ url: ':memory:' })
    const authWithWebauthn = await createAuthStore({
      db: db_,
      signingKey: SIGNING_KEY,
      collections: [],
      webauthn: WEBAUTHN_CONFIG,
    })
    const router = createAuthRouter({ auth: authWithWebauthn })
    const user = await authWithWebauthn.users.create({
      email: 'alice@example.com',
      roles: ['viewer'],
    })
    const session = await authWithWebauthn.sessions.create(user.id)
    return { db: db_, auth: authWithWebauthn, router, user, token: session.token }
  }

  describe('POST /api/auth/webauthn/register/begin', () => {
    it('requires an authenticated session', async () => {
      const { db: db_, router } = await withWebauthn()
      try {
        const response = await router.handle(request('POST', '/api/auth/webauthn/register/begin'))
        expect(response.status).toBe(401)
        expect((response.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED')
      } finally {
        await db_.close()
      }
    })

    it('returns registration options naming the relying party, and a ticket', async () => {
      const { db: db_, router, token } = await withWebauthn()
      try {
        const response = await router.handle(
          request('POST', '/api/auth/webauthn/register/begin', { token }),
        )
        expect(response.status).toBe(200)
        const body = response.body as {
          data: { options: { rp: { id: string } }; ticket: string }
        }
        expect(body.data.options.rp.id).toBe(WEBAUTHN_CONFIG.relyingPartyId)
        expect(body.data.ticket).toBeTruthy()
      } finally {
        await db_.close()
      }
    })
  })

  describe('POST /api/auth/webauthn/register/complete', () => {
    it('rejects a forged response with 401, never a raw crash', async () => {
      const { db: db_, router, token } = await withWebauthn()
      try {
        const begin = await router.handle(
          request('POST', '/api/auth/webauthn/register/begin', { token }),
        )
        const { ticket } = (begin.body as { data: { ticket: string } }).data

        const response = await router.handle(
          request('POST', '/api/auth/webauthn/register/complete', {
            body: {
              ticket,
              response: {
                id: 'forged',
                rawId: 'forged',
                type: 'public-key',
                clientExtensionResults: {},
                response: {
                  clientDataJSON: Buffer.from('{}').toString('base64url'),
                  attestationObject: Buffer.from('not-real-cbor').toString('base64url'),
                },
              },
            },
          }),
        )
        expect(response.status).toBe(401)
        expect((response.body as { error: { code: string } }).error.code).toBe(
          'AUTH_WEBAUTHN_FAILED',
        )
      } finally {
        await db_.close()
      }
    })

    it('rejects a request with no "response" field', async () => {
      const { db: db_, router, token } = await withWebauthn()
      try {
        const begin = await router.handle(
          request('POST', '/api/auth/webauthn/register/begin', { token }),
        )
        const { ticket } = (begin.body as { data: { ticket: string } }).data

        const response = await router.handle(
          request('POST', '/api/auth/webauthn/register/complete', { body: { ticket } }),
        )
        expect(response.status).toBe(400)
      } finally {
        await db_.close()
      }
    })
  })

  describe('POST /api/auth/webauthn/login/begin', () => {
    it('returns discoverable-credential options and a ticket, with no session required', async () => {
      const { db: db_, router } = await withWebauthn()
      try {
        const response = await router.handle(request('POST', '/api/auth/webauthn/login/begin'))
        expect(response.status).toBe(200)
        const body = response.body as {
          data: { options: { allowCredentials: unknown[] }; ticket: string }
        }
        expect(body.data.options.allowCredentials).toEqual([])
        expect(body.data.ticket).toBeTruthy()
      } finally {
        await db_.close()
      }
    })
  })

  describe('POST /api/auth/webauthn/login/complete', () => {
    it('refuses a passkey nobody registered', async () => {
      const { db: db_, router } = await withWebauthn()
      try {
        const begin = await router.handle(request('POST', '/api/auth/webauthn/login/begin'))
        const { ticket } = (begin.body as { data: { ticket: string } }).data

        const response = await router.handle(
          request('POST', '/api/auth/webauthn/login/complete', {
            body: { ticket, response: { id: 'never-registered' } },
          }),
        )
        expect(response.status).toBe(401)
        expect((response.body as { error: { code: string } }).error.code).toBe(
          'AUTH_WEBAUTHN_FAILED',
        )
      } finally {
        await db_.close()
      }
    })
  })

  it('reports AUTH_WEBAUTHN_FAILED when webauthn is not configured for the site', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(
      request('POST', '/api/auth/webauthn/login/begin', { body: {} }),
    )
    expect(response.status).toBe(401)
    expect((response.body as { error: { code: string } }).error.code).toBe('AUTH_WEBAUTHN_FAILED')
  })
})

describe('unknown routes', () => {
  it('answers 404 for a path this router does not own', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(request('GET', '/api/auth/nonexistent'))
    expect(response.status).toBe(404)
  })
})

describe('resolveActor', () => {
  it('is ANONYMOUS with no Authorization header', async () => {
    expect(await resolveActor(auth, {})).toEqual(ANONYMOUS)
  })

  it('is ANONYMOUS for a bogus token, rather than throwing', async () => {
    expect(await resolveActor(auth, { authorization: 'Bearer not-real' })).toEqual(ANONYMOUS)
  })

  it('resolves the real actor for a valid session token', async () => {
    const user = await createLoggedInUser('ed@example.com', 'correct horse battery staple')
    await auth.users.setRoles(user.id, ['editor', 'admin'])
    const session = await auth.sessions.create(user.id)

    const actor = await resolveActor(auth, { authorization: `Bearer ${session.token}` })
    expect(actor).toEqual({ id: user.id, roles: ['editor', 'admin'] })
  })

  it('is ANONYMOUS for a disabled user, even with a token that still resolves', async () => {
    const user = await createLoggedInUser('gone@example.com', 'correct horse battery staple')
    const session = await auth.sessions.create(user.id)
    await auth.users.setStatus(user.id, 'disabled')

    expect(await resolveActor(auth, { authorization: `Bearer ${session.token}` })).toEqual(
      ANONYMOUS,
    )
  })
})
