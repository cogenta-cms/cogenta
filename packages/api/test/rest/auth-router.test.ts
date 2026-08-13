import { type AuthStore, createAuthStore } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAuthRouter, resolveActor } from '../../src/rest/auth-router.js'
import type { RestRequest } from '../../src/rest/http.js'
import { ANONYMOUS } from '../../src/types.js'

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'

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
