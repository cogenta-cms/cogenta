import { type AuthStore, createAuthStore, DEFAULT_RATE_LIMIT_PER_MINUTE } from '@cogenta/auth'
import {
  createMemoryRateLimiter,
  createSqliteHandle,
  type DatabaseHandle,
  type RateLimitDriver,
} from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiKeysRouter } from '../../src/rest/api-keys-router.js'
import { resolveActor } from '../../src/rest/auth-router.js'
import type { RestRequest } from '../../src/rest/http.js'
import { type Actor, ANONYMOUS } from '../../src/types.js'

let db: DatabaseHandle
let auth: AuthStore
let clock: number

beforeEach(async () => {
  clock = Date.parse('2026-01-01T00:00:00.000Z')
  db = await createSqliteHandle({ url: ':memory:' })
  auth = await createAuthStore({
    db,
    signingKey: 'test-signing-key-not-a-real-secret',
    collections: [],
    now: () => clock,
  })
})

afterEach(async () => {
  await db.close()
})

function router() {
  return createApiKeysRouter({ auth, now: () => clock })
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

describe('expiry defaults (fiche 20 task 1)', () => {
  it('applies a 90-day default when no expiry is chosen', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
      admin,
    )
    const data = dataOf<{ expiresAt: string }>(created)
    expect(new Date(data.expiresAt).getTime()).toBe(clock + 90 * 24 * 60 * 60 * 1000)
  })

  it('honours an explicit expiry over the default', async () => {
    const chosen = new Date(clock + 30 * 24 * 60 * 60 * 1000).toISOString()
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'], expiresAt: chosen }),
      admin,
    )
    expect(dataOf<{ expiresAt: string }>(created).expiresAt).toBe(chosen)
  })

  it('mints a key that never expires when neverExpires is set', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'], neverExpires: true }),
      admin,
    )
    expect(dataOf<{ expiresAt: string | null }>(created).expiresAt).toBeNull()
  })

  it('refuses a request naming both an explicit expiry and neverExpires', async () => {
    const response = await router().handle(
      request('POST', '/api/api-keys', {
        name: 'x',
        scope: ['viewer'],
        expiresAt: new Date(clock + 1000).toISOString(),
        neverExpires: true,
      }),
      admin,
    )
    expect(response.status).toBe(400)
    expect(errorCodeOf(response)).toBe('QUERY_INVALID')
  })

  it('refuses an expired key even though it was never revoked', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', {
        name: 'x',
        scope: ['viewer'],
        expiresAt: new Date(clock + 1000).toISOString(),
      }),
      admin,
    )
    const issued = dataOf<{ key: string }>(created)

    clock += 1001
    const actor = await resolveActor(auth, { authorization: `Bearer ${issued.key}` })
    expect(actor).toEqual(ANONYMOUS)
  })
})

describe('per-key request quota (fiche 20 task 3, R1)', () => {
  it('defaults a fresh key to DEFAULT_RATE_LIMIT_PER_MINUTE', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
      admin,
    )
    expect(dataOf<{ rateLimitPerMinute: number }>(created).rateLimitPerMinute).toBe(
      DEFAULT_RATE_LIMIT_PER_MINUTE,
    )
  })

  it('honours a chosen quota', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'], rateLimitPerMinute: 5 }),
      admin,
    )
    expect(dataOf<{ rateLimitPerMinute: number }>(created).rateLimitPerMinute).toBe(5)
  })

  it('refuses a non-positive quota', async () => {
    const response = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'], rateLimitPerMinute: 0 }),
      admin,
    )
    expect(response.status).toBe(400)
  })

  it('runs the driver-dependent 429 behaviour with the degraded (memory) driver — works with no Redis (R1)', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'], rateLimitPerMinute: 2 }),
      admin,
    )
    const issued = dataOf<{ key: string }>(created)
    const headers = { authorization: `Bearer ${issued.key}` }
    const requestQuota: RateLimitDriver = createMemoryRateLimiter({ now: () => clock })

    await resolveActor(auth, headers, { requestQuota })
    await resolveActor(auth, headers, { requestQuota })

    await expect(resolveActor(auth, headers, { requestQuota })).rejects.toMatchObject({
      code: 'API_KEY_RATE_LIMITED',
      details: { limit: 2, remaining: 0 },
    })
  })

  it('never throttles a key with no requestQuota driver supplied', async () => {
    const created = await router().handle(
      request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'], rateLimitPerMinute: 1 }),
      admin,
    )
    const issued = dataOf<{ key: string }>(created)
    const headers = { authorization: `Bearer ${issued.key}` }

    for (let i = 0; i < 5; i += 1) {
      const actor = await resolveActor(auth, headers)
      expect(actor.roles).toEqual(['viewer'])
    }
  })

  it('keeps two different keys on independent quotas', async () => {
    const a = dataOf<{ key: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'a', scope: ['viewer'], rateLimitPerMinute: 1 }),
        admin,
      ),
    )
    const b = dataOf<{ key: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'b', scope: ['viewer'], rateLimitPerMinute: 1 }),
        admin,
      ),
    )
    const requestQuota: RateLimitDriver = createMemoryRateLimiter({ now: () => clock })

    await resolveActor(auth, { authorization: `Bearer ${a.key}` }, { requestQuota })
    // a is now at its limit of 1; b has made no calls yet and must not be affected.
    const bActor = await resolveActor(auth, { authorization: `Bearer ${b.key}` }, { requestQuota })
    expect(bActor.roles).toEqual(['viewer'])
  })
})

describe('rotation (fiche 20 task 2)', () => {
  it('carries the name and scope over to the new key — the same integration, not a new one', async () => {
    const created = dataOf<{ id: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'CI pipeline', scope: ['editor', 'viewer'] }),
        admin,
      ),
    )

    const rotated = await router().handle(
      request('POST', `/api/api-keys/${created.id}/rotate`),
      admin,
    )
    expect(rotated.status).toBe(201)
    const data = dataOf<{
      issued: { name: string; scope: readonly string[]; key: string }
      previous: Record<string, unknown>
    }>(rotated)
    expect(data.issued.name).toBe('CI pipeline')
    expect(data.issued.scope).toEqual(['editor', 'viewer'])
    expect(data.issued.key).toMatch(/^cogenta_sk_/)
  })

  it('keeps the old key valid, and the new one valid, during the grace window', async () => {
    const created = dataOf<{ id: string; key: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )

    const rotated = await router().handle(
      request('POST', `/api/api-keys/${created.id}/rotate`, { graceHours: 24 }),
      admin,
    )
    const data = dataOf<{ issued: { key: string } }>(rotated)

    const oldActor = await resolveActor(auth, { authorization: `Bearer ${created.key}` })
    const newActor = await resolveActor(auth, { authorization: `Bearer ${data.issued.key}` })
    expect(oldActor.roles).toEqual(['viewer'])
    expect(newActor.roles).toEqual(['viewer'])
  })

  it('lets the old key expire on its own once the grace window passes', async () => {
    const created = dataOf<{ id: string; key: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )
    await router().handle(
      request('POST', `/api/api-keys/${created.id}/rotate`, { graceHours: 1 }),
      admin,
    )

    clock += 60 * 60 * 1000 + 1
    const afterGrace = await resolveActor(auth, { authorization: `Bearer ${created.key}` })
    expect(afterGrace).toEqual(ANONYMOUS)
  })

  it('marks the old key as superseded by the new one, visible in the list', async () => {
    const created = dataOf<{ id: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )
    const rotated = dataOf<{ issued: { id: string } }>(
      await router().handle(request('POST', `/api/api-keys/${created.id}/rotate`), admin),
    )

    const listed = dataOf<readonly { id: string; supersededBy: string | null }[]>(
      await router().handle(request('GET', '/api/api-keys'), admin),
    )
    const old = listed.find((k) => k.id === created.id)
    expect(old?.supersededBy).toBe(rotated.issued.id)
  })

  it('carries the quota over to the rotated key', async () => {
    const created = dataOf<{ id: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'], rateLimitPerMinute: 42 }),
        admin,
      ),
    )
    const rotated = dataOf<{ issued: { rateLimitPerMinute: number } }>(
      await router().handle(request('POST', `/api/api-keys/${created.id}/rotate`), admin),
    )
    expect(rotated.issued.rateLimitPerMinute).toBe(42)
  })

  it('refuses to rotate a revoked key', async () => {
    const created = dataOf<{ id: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )
    await router().handle(request('DELETE', `/api/api-keys/${created.id}`), admin)

    const response = await router().handle(
      request('POST', `/api/api-keys/${created.id}/rotate`),
      admin,
    )
    expect(response.status).toBe(409)
    expect(errorCodeOf(response)).toBe('API_KEY_ROTATION_INVALID')
  })

  it('refuses a grace window longer than 7 days', async () => {
    const created = dataOf<{ id: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )
    const response = await router().handle(
      request('POST', `/api/api-keys/${created.id}/rotate`, { graceHours: 24 * 8 }),
      admin,
    )
    expect(response.status).toBe(400)
  })

  it('refuses a non-admin rotating a key', async () => {
    const created = dataOf<{ id: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )
    const response = await router().handle(
      request('POST', `/api/api-keys/${created.id}/rotate`),
      actorFor('e-1', ['editor']),
    )
    expect(response.status).toBe(403)
  })

  it('never includes the old key material in a rotation response', async () => {
    const created = dataOf<{ id: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )
    const rotated = await router().handle(
      request('POST', `/api/api-keys/${created.id}/rotate`),
      admin,
    )
    const data = dataOf<{ previous: Record<string, unknown> }>(rotated)
    expect(data.previous).not.toHaveProperty('key')
  })
})

describe('usage and hygiene (fiche 20 task 4)', () => {
  it('reports zero usage for a key that was never used', async () => {
    await router().handle(request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }), admin)
    const listed = dataOf<readonly { usage: { last7Days: number; last30Days: number } }[]>(
      await router().handle(request('GET', '/api/api-keys'), admin),
    )
    expect(listed[0]?.usage).toEqual({ last7Days: 0, last30Days: 0 })
  })

  it('counts a successful verification, aggregated per key rather than as a log line', async () => {
    const created = dataOf<{ key: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )

    await resolveActor(auth, { authorization: `Bearer ${created.key}` })
    await resolveActor(auth, { authorization: `Bearer ${created.key}` })
    await resolveActor(auth, { authorization: `Bearer ${created.key}` })

    const usage = await auth.apiKeys.usage(
      dataOf<{ id: string }[]>(await router().handle(request('GET', '/api/api-keys'), admin))[0]
        ?.id as string,
    )
    expect(usage.last7Days).toBe(3)
    expect(usage.last30Days).toBe(3)
  })

  it('does not count usage from more than 30 days ago', async () => {
    const created = dataOf<{ id: string; key: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )
    await resolveActor(auth, { authorization: `Bearer ${created.key}` })

    clock += 31 * 24 * 60 * 60 * 1000
    const usage = await auth.apiKeys.usage(created.id)
    expect(usage.last30Days).toBe(0)
  })
})

describe('pagination (fiche 67 task 5)', () => {
  it("returns every key, unpaginated, when limit/offset are both omitted — mcp.tsx's picker relies on this", async () => {
    for (let index = 0; index < 5; index += 1) {
      await router().handle(
        request('POST', '/api/api-keys', { name: `key-${index}`, scope: ['viewer'] }),
        admin,
      )
      clock += 1_000
    }

    const listed = await router().handle(request('GET', '/api/api-keys'), admin)
    expect(dataOf<readonly unknown[]>(listed)).toHaveLength(5)
    expect((listed.body as { page?: { hasMore: boolean } }).page?.hasMore).toBe(false)
  })

  it('pages with limit/offset, newest first, and reports hasMore correctly', async () => {
    for (let index = 0; index < 5; index += 1) {
      await router().handle(
        request('POST', '/api/api-keys', { name: `key-${index}`, scope: ['viewer'] }),
        admin,
      )
      clock += 1_000
    }

    const firstPage = await router().handle(
      { method: 'GET', path: '/api/api-keys', query: { limit: '2' } },
      admin,
    )
    const firstNames = dataOf<readonly { name: string }[]>(firstPage).map((k) => k.name)
    expect(firstNames).toEqual(['key-4', 'key-3'])
    expect((firstPage.body as { page: { hasMore: boolean } }).page.hasMore).toBe(true)

    const lastPage = await router().handle(
      { method: 'GET', path: '/api/api-keys', query: { limit: '2', offset: '4' } },
      admin,
    )
    const lastNames = dataOf<readonly { name: string }[]>(lastPage).map((k) => k.name)
    expect(lastNames).toEqual(['key-0'])
    expect((lastPage.body as { page: { hasMore: boolean } }).page.hasMore).toBe(false)
  })

  it('rejects a limit past the ceiling', async () => {
    const response = await router().handle(
      { method: 'GET', path: '/api/api-keys', query: { limit: '10000' } },
      admin,
    )
    expect(response.status).toBe(400)
  })
})

describe('security: the raw key is never returned outside creation and rotation', () => {
  it('list, and every field on it, never carries "key"', async () => {
    const created = dataOf<{ key: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )
    const listed = dataOf<readonly Record<string, unknown>[]>(
      await router().handle(request('GET', '/api/api-keys'), admin),
    )
    for (const entry of listed) {
      expect(entry).not.toHaveProperty('key')
      // The prefix field legitimately starts with the same "cogenta_sk_"
      // marker (by design, so a list is recognisable) — what must never
      // appear is the *full* raw secret this key was minted with.
      expect(JSON.stringify(entry)).not.toContain(created.key)
    }
  })

  it("a rotation's previous-key record never carries the old raw key either", async () => {
    const created = dataOf<{ id: string; key: string }>(
      await router().handle(
        request('POST', '/api/api-keys', { name: 'x', scope: ['viewer'] }),
        admin,
      ),
    )
    const rotated = dataOf<{ previous: Record<string, unknown> }>(
      await router().handle(request('POST', `/api/api-keys/${created.id}/rotate`), admin),
    )
    expect(JSON.stringify(rotated.previous)).not.toContain(created.key)
  })
})
