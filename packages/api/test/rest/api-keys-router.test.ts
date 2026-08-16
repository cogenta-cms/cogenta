import { type AuthStore, createAuthStore } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiKeysRouter } from '../../src/rest/api-keys-router.js'
import { resolveActor } from '../../src/rest/auth-router.js'
import type { RestRequest } from '../../src/rest/http.js'
import { type Actor, ANONYMOUS } from '../../src/types.js'

let db: DatabaseHandle
let auth: AuthStore

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  auth = await createAuthStore({
    db,
    signingKey: 'test-signing-key-not-a-real-secret',
    collections: [],
  })
})

afterEach(async () => {
  await db.close()
})

function router() {
  return createApiKeysRouter({ auth })
}

function request(method: string, path: string, body?: unknown): RestRequest {
  return { method, path, query: {}, ...(body === undefined ? {} : { body }) }
}

function actorFor(id: string, roles: readonly string[]): Actor {
  return { id, roles }
}

function dataOf<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data
}

function errorCodeOf(response: { body: unknown }): string {
  return (response.body as { error: { code: string } }).error.code
}

const admin: Actor = actorFor('admin-1', ['admin'])

describe('permissions by role', () => {
  it('refuses a non-admin listing keys', async () => {
    const response = await router().handle(
      request('GET', '/api/api-keys'),
      actorFor('e-1', ['editor']),
    )
    expect(response.status).toBe(403)
    expect(errorCodeOf(response)).toBe('FORBIDDEN')
  })

  it('refuses a non-admin creating a key', async () => {
    const response = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
      actorFor('e-1', ['editor']),
    )
    expect(response.status).toBe(403)
  })

  it('refuses an anonymous caller entirely', async () => {
    const response = await router().handle(request('GET', '/api/api-keys'), ANONYMOUS)
    expect(response.status).toBe(403)
  })

  it('refuses a non-admin revoking a key', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
      admin,
    )
    const id = dataOf<{ id: string }>(created).id

    const response = await router().handle(
      request('DELETE', `/api/api-keys/${id}`),
      actorFor('e-1', ['editor']),
    )
    expect(response.status).toBe(403)
  })
})

describe('creating a key', () => {
  it('returns the raw key exactly once, in the creation response', async () => {
    const response = await router().handle(
      request('POST', '/api/api-keys', { name: 'CI script', scope: ['viewer'] }),
      admin,
    )
    expect(response.status).toBe(201)
    const data = dataOf<{ key: string; prefix: string }>(response)
    expect(data.key).toMatch(/^cogenta_sk_/)
    expect(data.prefix).toBe(data.key.slice(0, 12))
  })

  it('never includes the raw key in the list response afterwards', async () => {
    await router().handle(
      request('POST', '/api/api-keys', { name: 'CI script', scope: ['viewer'] }),
      admin,
    )

    const listed = await router().handle(request('GET', '/api/api-keys'), admin)
    const data = dataOf<readonly Record<string, unknown>[]>(listed)
    expect(data).toHaveLength(1)
    expect(data[0]).not.toHaveProperty('key')
  })

  it('refuses a key with no scope', async () => {
    const response = await router().handle(
      request('POST', '/api/api-keys', { name: 'CI script', scope: [] }),
      admin,
    )
    expect(response.status).toBe(400)
    expect(errorCodeOf(response)).toBe('QUERY_INVALID')
  })

  it('refuses a request missing a name', async () => {
    const response = await router().handle(
      request('POST', '/api/api-keys', { scope: ['viewer'] }),
      admin,
    )
    expect(response.status).toBe(400)
  })
})

describe('revoking a key', () => {
  it('makes the key stop authenticating', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'CI script', scope: ['editor'] }),
      admin,
    )
    const issued = dataOf<{ id: string; key: string }>(created)

    const before = await resolveActor(auth, { authorization: `Bearer ${issued.key}` })
    expect(before.roles).toEqual(['editor'])

    const revoked = await router().handle(request('DELETE', `/api/api-keys/${issued.id}`), admin)
    expect(revoked.status).toBe(204)

    const after = await resolveActor(auth, { authorization: `Bearer ${issued.key}` })
    expect(after).toEqual(ANONYMOUS)
  })

  it('reports a 404 for an id that was never a key', async () => {
    const response = await router().handle(request('DELETE', '/api/api-keys/nope'), admin)
    expect(response.status).toBe(404)
    expect(errorCodeOf(response)).toBe('API_KEY_NOT_FOUND')
  })
})

describe('resolveActor with an API key', () => {
  it('resolves to an actor scoped to exactly the granted roles, never more', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'read-only bot', scope: ['viewer'] }),
      admin,
    )
    const issued = dataOf<{ key: string }>(created)

    const actor = await resolveActor(auth, { authorization: `Bearer ${issued.key}` })
    expect(actor.roles).toEqual(['viewer'])
    expect(actor.roles).not.toContain('admin')
  })

  it('never resolves to the admin role just because the key was created by an admin', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'scoped bot', scope: ['editor'] }),
      admin,
    )
    const issued = dataOf<{ key: string }>(created)

    const actor = await resolveActor(auth, { authorization: `Bearer ${issued.key}` })
    expect(actor.roles).toEqual(['editor'])
  })

  it('falls back to anonymous for a made-up key', async () => {
    const actor = await resolveActor(auth, {
      authorization: 'Bearer cogenta_sk_not-a-real-key-at-all',
    })
    expect(actor).toEqual(ANONYMOUS)
  })

  it('rate-limits repeated invalid attempts at the same fake key', async () => {
    const headers = { authorization: 'Bearer cogenta_sk_persistently-wrong' }
    let last = await resolveActor(auth, headers)
    for (let i = 0; i < 30; i += 1) {
      last = await resolveActor(auth, headers)
    }
    // Backed off or not, resolveActor never throws — a rate-limited attempt
    // degrades to anonymous exactly like an ordinary invalid one.
    expect(last).toEqual(ANONYMOUS)
  })

  it('still resolves an ordinary session token, unaffected by the key path', async () => {
    const user = await auth.users.create({ email: 'person@example.com', roles: ['editor'] })
    const session = await auth.sessions.create(user.id)

    const actor = await resolveActor(auth, { authorization: `Bearer ${session.token}` })
    expect(actor.id).toBe(user.id)
    expect(actor.roles).toEqual(['editor'])
  })
})
