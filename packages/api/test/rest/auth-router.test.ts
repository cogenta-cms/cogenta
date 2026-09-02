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
  options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
): RestRequest {
  return {
    method,
    path,
    query: {},
    ...(options.body === undefined ? {} : { body: options.body }),
    headers: {
      ...options.headers,
      ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
    },
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

/**
 * ADR-0021. Sign-in no longer turns anyone away for lacking a second factor, so
 * enrolment is no longer a step in the sign-in flow: it is self-service on an
 * account that is already signed in, and the account it touches is whichever
 * one the bearer token resolves to.
 */
describe('POST /api/auth/login, since MFA stopped being a gate', () => {
  async function editorWithoutMfa() {
    const db_ = await createSqliteHandle({ url: ':memory:' })
    const authWithMfa = await createAuthStore({
      db: db_,
      signingKey: SIGNING_KEY,
      collections: PUBLISH_COLLECTIONS,
    })
    const user = await authWithMfa.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await authWithMfa.credentials.setPassword(user.id, 'correct horse battery staple')
    return { db: db_, auth: authWithMfa, router: createAuthRouter({ auth: authWithMfa }), user }
  }

  it('issues a session to a publish-capable role with no second factor at all', async () => {
    const { db: db_, router } = await editorWithoutMfa()
    try {
      const login = await router.handle(
        request('POST', '/api/auth/login', {
          body: { email: 'ed@example.com', password: 'correct horse battery staple' },
        }),
      )
      expect(login.status).toBe(200)
      const body = login.body as { data: { status: string; session: { token: string } } }
      expect(body.data.status).toBe('session')
      expect(body.data.session.token).toBeTruthy()
    } finally {
      await db_.close()
    }
  })
})

describe('TOTP self-service enrolment', () => {
  async function signedInEditor() {
    const db_ = await createSqliteHandle({ url: ':memory:' })
    const authWithMfa = await createAuthStore({
      db: db_,
      signingKey: SIGNING_KEY,
      collections: PUBLISH_COLLECTIONS,
    })
    const user = await authWithMfa.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await authWithMfa.credentials.setPassword(user.id, 'correct horse battery staple')
    const session = await authWithMfa.sessions.create(user.id)
    return {
      db: db_,
      auth: authWithMfa,
      router: createAuthRouter({ auth: authWithMfa }),
      user,
      token: session.token,
    }
  }

  it('refuses to begin enrolment without a session', async () => {
    const { db: db_, router } = await signedInEditor()
    try {
      const response = await router.handle(request('POST', '/api/auth/totp/enrol'))
      expect(response.status).toBe(401)
      expect((response.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED')
    } finally {
      await db_.close()
    }
  })

  it('refuses to confirm enrolment without a session', async () => {
    const { db: db_, router } = await signedInEditor()
    try {
      const response = await router.handle(
        request('POST', '/api/auth/totp/enrol/confirm', { body: { token: '000000' } }),
      )
      expect(response.status).toBe(401)
    } finally {
      await db_.close()
    }
  })

  it('refuses to turn the factor off without a session', async () => {
    const { db: db_, router } = await signedInEditor()
    try {
      const response = await router.handle(request('DELETE', '/api/auth/totp'))
      expect(response.status).toBe(401)
    } finally {
      await db_.close()
    }
  })

  it('begins enrolment with a secret and a QR-ready URI', async () => {
    const { db: db_, router, token } = await signedInEditor()
    try {
      const response = await router.handle(request('POST', '/api/auth/totp/enrol', { token }))
      expect(response.status).toBe(200)
      const body = response.body as { data: { secret: string; uri: string } }
      expect(body.data.secret.length).toBeGreaterThan(0)
      expect(body.data.uri).toMatch(/^otpauth:\/\/totp\//)
    } finally {
      await db_.close()
    }
  })

  it('makes the next sign-in ask for a code once the right code confirms it', async () => {
    const { db: db_, router, token } = await signedInEditor()
    try {
      const now = Math.floor(Date.now() / 1000)
      const begin = await router.handle(request('POST', '/api/auth/totp/enrol', { token }))
      const { secret } = (begin.body as { data: { secret: string } }).data

      const confirm = await router.handle(
        request('POST', '/api/auth/totp/enrol/confirm', {
          token,
          body: { token: codeFor(secret, now) },
        }),
      )
      expect(confirm.status).toBe(200)

      const login = await router.handle(
        request('POST', '/api/auth/login', {
          body: { email: 'ed@example.com', password: 'correct horse battery staple' },
        }),
      )
      expect((login.body as { data: { status: string } }).data.status).toBe('mfa_required')
    } finally {
      await db_.close()
    }
  })

  it('rejects the wrong confirmation code with 401', async () => {
    const { db: db_, router, token } = await signedInEditor()
    try {
      await router.handle(request('POST', '/api/auth/totp/enrol', { token }))
      const response = await router.handle(
        request('POST', '/api/auth/totp/enrol/confirm', { token, body: { token: '000000' } }),
      )
      expect(response.status).toBe(401)
    } finally {
      await db_.close()
    }
  })

  it('enrols only the caller, never an account named in the request', async () => {
    const { db: db_, auth: authWithMfa, router, token } = await signedInEditor()
    try {
      const other = await authWithMfa.users.create({
        email: 'victim@example.com',
        roles: ['editor'],
      })

      await router.handle(
        request('POST', '/api/auth/totp/enrol', { token, body: { userId: other.id } }),
      )

      expect(await authWithMfa.credentials.totpSecret(other.id)).toBeNull()
    } finally {
      await db_.close()
    }
  })

  it('turns the factor back off, and the next sign-in stops asking', async () => {
    const { db: db_, router, token } = await signedInEditor()
    try {
      const now = Math.floor(Date.now() / 1000)
      const begin = await router.handle(request('POST', '/api/auth/totp/enrol', { token }))
      const { secret } = (begin.body as { data: { secret: string } }).data
      await router.handle(
        request('POST', '/api/auth/totp/enrol/confirm', {
          token,
          body: { token: codeFor(secret, now) },
        }),
      )

      const off = await router.handle(request('DELETE', '/api/auth/totp', { token }))
      expect(off.status).toBe(204)

      const login = await router.handle(
        request('POST', '/api/auth/login', {
          body: { email: 'ed@example.com', password: 'correct horse battery staple' },
        }),
      )
      expect((login.body as { data: { status: string } }).data.status).toBe('session')
    } finally {
      await db_.close()
    }
  })
})

/**
 * Fiche 18 task 1 — the whole reason for this fiche. `confirmTotpEnrolment`
 * now hands back ten recovery codes in the same response, and
 * `/api/auth/recovery-code` is the door they open.
 */
describe('Recovery codes', () => {
  async function signedInEditorWithTotpAndCodes() {
    const db_ = await createSqliteHandle({ url: ':memory:' })
    const authWithMfa = await createAuthStore({
      db: db_,
      signingKey: SIGNING_KEY,
      collections: PUBLISH_COLLECTIONS,
    })
    const user = await authWithMfa.users.create({ email: 'ed@example.com', roles: ['editor'] })
    await authWithMfa.credentials.setPassword(user.id, 'correct horse battery staple')
    const session = await authWithMfa.sessions.create(user.id)
    const router = createAuthRouter({ auth: authWithMfa })

    const now = Math.floor(Date.now() / 1000)
    const begin = await router.handle(
      request('POST', '/api/auth/totp/enrol', { token: session.token }),
    )
    const { secret } = (begin.body as { data: { secret: string } }).data
    const confirm = await router.handle(
      request('POST', '/api/auth/totp/enrol/confirm', {
        token: session.token,
        body: { token: codeFor(secret, now) },
      }),
    )
    const codes = (confirm.body as { data: { recoveryCodes: string[] } }).data.recoveryCodes

    return { db: db_, auth: authWithMfa, router, user, token: session.token, codes }
  }

  it('confirming TOTP enrolment hands back ten codes, shown once', async () => {
    const { db: db_, codes } = await signedInEditorWithTotpAndCodes()
    try {
      expect(codes).toHaveLength(10)
      expect(new Set(codes).size).toBe(10)
    } finally {
      await db_.close()
    }
  })

  it('signs in end to end with a recovery code, and the same code is refused a second time', async () => {
    const { db: db_, router, codes } = await signedInEditorWithTotpAndCodes()
    try {
      const login = await router.handle(
        request('POST', '/api/auth/login', {
          body: { email: 'ed@example.com', password: 'correct horse battery staple' },
        }),
      )
      const { ticket } = (login.body as { data: { ticket: string } }).data
      const code = codes[0]
      if (code === undefined) throw new Error('no code issued')

      const first = await router.handle(
        request('POST', '/api/auth/recovery-code', { body: { ticket, code } }),
      )
      expect(first.status).toBe(200)
      const body = first.body as { data: { status: string; session?: { token: string } } }
      expect(body.data.status).toBe('session')
      expect(body.data.session?.token).toBeTruthy()

      const secondLogin = await router.handle(
        request('POST', '/api/auth/login', {
          body: { email: 'ed@example.com', password: 'correct horse battery staple' },
        }),
      )
      const secondTicket = (secondLogin.body as { data: { ticket: string } }).data.ticket
      const second = await router.handle(
        request('POST', '/api/auth/recovery-code', { body: { ticket: secondTicket, code } }),
      )
      expect(second.status).toBe(401)
      expect((second.body as { error: { code: string } }).error.code).toBe(
        'AUTH_RECOVERY_CODE_INVALID',
      )
    } finally {
      await db_.close()
    }
  }, 15_000)

  it('rejects an unknown code with 401, not a crash', async () => {
    const { db: db_, router } = await signedInEditorWithTotpAndCodes()
    try {
      const login = await router.handle(
        request('POST', '/api/auth/login', {
          body: { email: 'ed@example.com', password: 'correct horse battery staple' },
        }),
      )
      const { ticket } = (login.body as { data: { ticket: string } }).data

      const response = await router.handle(
        request('POST', '/api/auth/recovery-code', { body: { ticket, code: 'AAAAA-AAAAA' } }),
      )
      expect(response.status).toBe(401)
    } finally {
      await db_.close()
    }
  })

  it('refuses GET on the recovery-code route', async () => {
    const { db: db_, router } = await signedInEditorWithTotpAndCodes()
    try {
      const response = await router.handle(request('GET', '/api/auth/recovery-code'))
      expect(response.status).toBe(405)
    } finally {
      await db_.close()
    }
  })

  describe('GET /api/auth/totp/recovery-codes', () => {
    it('reports how many remain, and requires a session', async () => {
      const { db: db_, router, token } = await signedInEditorWithTotpAndCodes()
      try {
        const anonymous = await router.handle(request('GET', '/api/auth/totp/recovery-codes'))
        expect(anonymous.status).toBe(401)

        const response = await router.handle(
          request('GET', '/api/auth/totp/recovery-codes', { token }),
        )
        expect(response.status).toBe(200)
        expect(response.body).toEqual({ data: { total: 10, remaining: 10 } })
      } finally {
        await db_.close()
      }
    })
  })

  describe('POST /api/auth/totp/recovery-codes/regenerate', () => {
    it('replaces the batch: the old codes stop working, the new ones do', async () => {
      const { db: db_, router, token, codes } = await signedInEditorWithTotpAndCodes()
      try {
        const regenerate = await router.handle(
          request('POST', '/api/auth/totp/recovery-codes/regenerate', { token }),
        )
        expect(regenerate.status).toBe(200)
        const fresh = (regenerate.body as { data: { recoveryCodes: string[] } }).data.recoveryCodes
        expect(fresh).toHaveLength(10)
        expect(new Set(fresh)).not.toEqual(new Set(codes))

        const login = await router.handle(
          request('POST', '/api/auth/login', {
            body: { email: 'ed@example.com', password: 'correct horse battery staple' },
          }),
        )
        const { ticket } = (login.body as { data: { ticket: string } }).data
        const oldCode = codes[0]
        if (oldCode === undefined) throw new Error('no code issued')
        const withOld = await router.handle(
          request('POST', '/api/auth/recovery-code', { body: { ticket, code: oldCode } }),
        )
        expect(withOld.status).toBe(401)
      } finally {
        await db_.close()
      }
    }, 30_000)

    it('requires a session', async () => {
      const { db: db_, router } = await signedInEditorWithTotpAndCodes()
      try {
        const response = await router.handle(
          request('POST', '/api/auth/totp/recovery-codes/regenerate'),
        )
        expect(response.status).toBe(401)
      } finally {
        await db_.close()
      }
    })
  })
})

describe('GET /api/auth/password-policy', () => {
  it('is public and announces the same floor the server enforces', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(request('GET', '/api/auth/password-policy'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { minLength: 12 } })
  })

  it('refuses POST', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(request('POST', '/api/auth/password-policy'))
    expect(response.status).toBe(405)
  })
})

/** Fiche 18 tasks 2 and 5: what the login step records about the request making it. */
describe('LoginContext — remember me and device metadata', () => {
  it('uses the default session length when "rememberMe" is omitted (no regression)', async () => {
    const router = createAuthRouter({ auth })
    await createLoggedInUser('alice@example.com', 'correct horse battery staple')

    const response = await router.handle(
      request('POST', '/api/auth/login', {
        body: { email: 'alice@example.com', password: 'correct horse battery staple' },
      }),
    )
    const body = response.body as {
      data: { session: { expiresAt: string } }
    }
    const lifetimeDays =
      (new Date(body.data.session.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(lifetimeDays).toBeGreaterThan(29)
  })

  it('shortens the session when "rememberMe" is explicitly false', async () => {
    const router = createAuthRouter({ auth })
    await createLoggedInUser('alice@example.com', 'correct horse battery staple')

    const response = await router.handle(
      request('POST', '/api/auth/login', {
        body: {
          email: 'alice@example.com',
          password: 'correct horse battery staple',
          rememberMe: false,
        },
      }),
    )
    const body = response.body as {
      data: { session: { expiresAt: string } }
    }
    const lifetimeHours = (new Date(body.data.session.expiresAt).getTime() - Date.now()) / 3_600_000
    expect(lifetimeHours).toBeLessThan(25)
    expect(lifetimeHours).toBeGreaterThan(23)
  })

  it('records a browser and device from the User-Agent header on the session it creates', async () => {
    const router = createAuthRouter({ auth })
    await createLoggedInUser('alice@example.com', 'correct horse battery staple')

    await router.handle(
      request('POST', '/api/auth/login', {
        body: { email: 'alice@example.com', password: 'correct horse battery staple' },
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        },
      }),
    )

    const user = await auth.users.byEmail('alice@example.com')
    if (user === null) throw new Error('user not found')
    const [session] = await auth.sessions.list(user.id)
    expect(session?.browser).toBe('chrome')
    expect(session?.device).toBe('desktop')
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

describe('POST /api/auth/forgot-password', () => {
  it('answers identically for an existing and a non-existing account', async () => {
    const router = createAuthRouter({ auth })
    await createLoggedInUser('real@example.com', 'correct horse battery staple')

    const forReal = await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'real@example.com' } }),
    )
    const forGhost = await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'ghost@example.com' } }),
    )

    expect(forReal.status).toBe(forGhost.status)
    expect(forReal.body).toEqual(forGhost.body)
    expect(forReal.status).toBe(200)
  })

  it('issues a real, redeemable token only for the real account, delivered through onForgotPassword', async () => {
    const delivered: { email: string; token: string }[] = []
    const router = createAuthRouter({
      auth,
      onForgotPassword: async (event) => {
        delivered.push({ email: event.user.email, token: event.token })
      },
    })
    await createLoggedInUser('real@example.com', 'correct horse battery staple')

    await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'real@example.com' } }),
    )
    await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'ghost@example.com' } }),
    )

    expect(delivered).toHaveLength(1)
    expect(delivered[0]?.email).toBe('real@example.com')
    expect(delivered[0]?.token).toBeTruthy()
  })

  it('is case-insensitive on the email, so a differently-cased real address is still found', async () => {
    const delivered: string[] = []
    const router = createAuthRouter({
      auth,
      onForgotPassword: async (event) => {
        delivered.push(event.user.email)
      },
    })
    await createLoggedInUser('mixed@example.com', 'correct horse battery staple')

    await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'MIXED@Example.com' } }),
    )

    expect(delivered).toEqual(['mixed@example.com'])
  })

  it('does not issue a token for a disabled account, but still answers the same way', async () => {
    const delivered: string[] = []
    const router = createAuthRouter({
      auth,
      onForgotPassword: async (event) => {
        delivered.push(event.user.email)
      },
    })
    const user = await createLoggedInUser('disabled@example.com', 'correct horse battery staple')
    await auth.users.setStatus(user.id, 'disabled')

    const response = await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'disabled@example.com' } }),
    )

    expect(response.status).toBe(200)
    expect(delivered).toHaveLength(0)
  })

  it('rate-limits repeated requests for the same email, whether or not it exists', async () => {
    const router = createAuthRouter({ auth })

    for (let i = 0; i < 20; i += 1) {
      await router.handle(
        request('POST', '/api/auth/forgot-password', {
          body: { email: 'hammered@example.com' },
        }),
      )
    }

    const response = await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'hammered@example.com' } }),
    )
    expect(response.status).toBe(429)
    expect((response.body as { error: { code: string } }).error.code).toBe('AUTH_RATE_LIMITED')
    // T09-02 — a 429 that only says "try again later" in prose gives a
    // client nothing to poll against; `Retry-After` (in whole seconds,
    // never the raw `retryAfterMs` from `CogentaError.details`, which
    // `errorResponse` never puts on the wire) is what makes the backoff
    // actually actionable.
    expect(response.headers['retry-after']).toBeDefined()
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('refuses a body with no email', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(request('POST', '/api/auth/forgot-password', { body: {} }))
    expect(response.status).toBe(400)
  })
})

describe('POST /api/auth/reset-password', () => {
  it('completes the full loop: request, redeem, sign in with the new password, old one refused', async () => {
    let issuedToken = ''
    const router = createAuthRouter({
      auth,
      onForgotPassword: async (event) => {
        issuedToken = event.token
      },
    })
    await createLoggedInUser('loop@example.com', 'correct horse battery staple')

    await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'loop@example.com' } }),
    )
    expect(issuedToken).toBeTruthy()

    const reset = await router.handle(
      request('POST', '/api/auth/reset-password', {
        body: { token: issuedToken, newPassword: 'a brand new long passphrase' },
      }),
    )
    expect(reset.status).toBe(200)

    const oldLogin = await router.handle(
      request('POST', '/api/auth/login', {
        body: { email: 'loop@example.com', password: 'correct horse battery staple' },
      }),
    )
    expect(oldLogin.status).toBe(401)

    const newLogin = await router.handle(
      request('POST', '/api/auth/login', {
        body: { email: 'loop@example.com', password: 'a brand new long passphrase' },
      }),
    )
    expect(newLogin.status).toBe(200)
  })

  it('signs out every existing session on a successful reset', async () => {
    let issuedToken = ''
    const router = createAuthRouter({
      auth,
      onForgotPassword: async (event) => {
        issuedToken = event.token
      },
    })
    const user = await createLoggedInUser('sessions@example.com', 'correct horse battery staple')
    const session = await auth.sessions.create(user.id)
    expect(await auth.sessions.resolve(session.token)).not.toBeNull()

    await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'sessions@example.com' } }),
    )
    await router.handle(
      request('POST', '/api/auth/reset-password', {
        body: { token: issuedToken, newPassword: 'a brand new long passphrase' },
      }),
    )

    expect(await auth.sessions.resolve(session.token)).toBeNull()
  })

  it('refuses a token twice — single use', async () => {
    let issuedToken = ''
    const router = createAuthRouter({
      auth,
      onForgotPassword: async (event) => {
        issuedToken = event.token
      },
    })
    await createLoggedInUser('once@example.com', 'correct horse battery staple')
    await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'once@example.com' } }),
    )

    const first = await router.handle(
      request('POST', '/api/auth/reset-password', {
        body: { token: issuedToken, newPassword: 'a brand new long passphrase' },
      }),
    )
    expect(first.status).toBe(200)

    const second = await router.handle(
      request('POST', '/api/auth/reset-password', {
        body: { token: issuedToken, newPassword: 'yet another long passphrase' },
      }),
    )
    expect(second.status).toBe(400)
    expect((second.body as { error: { code: string } }).error.code).toBe('AUTH_RESET_TOKEN_INVALID')
  })

  it('refuses a token that was never issued', async () => {
    const router = createAuthRouter({ auth })
    const response = await router.handle(
      request('POST', '/api/auth/reset-password', {
        body: { token: 'not-a-real-token', newPassword: 'a brand new long passphrase' },
      }),
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'AUTH_RESET_TOKEN_INVALID',
    )
  })

  it('refuses a new password shorter than the policy floor', async () => {
    let issuedToken = ''
    const router = createAuthRouter({
      auth,
      onForgotPassword: async (event) => {
        issuedToken = event.token
      },
    })
    await createLoggedInUser('short@example.com', 'correct horse battery staple')
    await router.handle(
      request('POST', '/api/auth/forgot-password', { body: { email: 'short@example.com' } }),
    )

    const response = await router.handle(
      request('POST', '/api/auth/reset-password', {
        body: { token: issuedToken, newPassword: 'short' },
      }),
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('AUTH_PASSWORD_INVALID')
  })

  /**
   * Fiche 17 task 1: an invitation reuses this exact route and this exact
   * token primitive rather than a second one — redeeming it is what turns
   * "invited" into "active", the only place in the product that flips that
   * bit.
   */
  it('activates an invited account the moment its token is redeemed', async () => {
    const router = createAuthRouter({ auth })
    const invitee = await auth.users.create({
      email: 'invitee@example.com',
      roles: ['editor'],
      status: 'invited',
    })
    const issued = await auth.resets.issue(invitee.id)

    const response = await router.handle(
      request('POST', '/api/auth/reset-password', {
        body: { token: issued.token, newPassword: 'a chosen passphrase for the invitee' },
      }),
    )
    expect(response.status).toBe(200)
    expect((await auth.users.byId(invitee.id))?.status).toBe('active')

    const login = await router.handle(
      request('POST', '/api/auth/login', {
        body: { email: 'invitee@example.com', password: 'a chosen passphrase for the invitee' },
      }),
    )
    expect(login.status).toBe(200)
  })

  it('leaves an ordinary reset on an already-active account untouched', async () => {
    let issuedToken = ''
    const router = createAuthRouter({
      auth,
      onForgotPassword: async (event) => {
        issuedToken = event.token
      },
    })
    const user = await createLoggedInUser(
      'already-active@example.com',
      'correct horse battery staple',
    )
    await router.handle(
      request('POST', '/api/auth/forgot-password', {
        body: { email: 'already-active@example.com' },
      }),
    )

    await router.handle(
      request('POST', '/api/auth/reset-password', {
        body: { token: issuedToken, newPassword: 'a brand new long passphrase' },
      }),
    )

    expect((await auth.users.byId(user.id))?.status).toBe('active')
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
