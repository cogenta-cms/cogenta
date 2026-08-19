import { createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AuditRouter, createAuditRouter } from '../../src/rest/audit-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }
/** Matches the actor id the fixture's first two entries are recorded under. */
const USER_ONE = { id: 'user-1', roles: ['editor'] }

let db: DatabaseHandle
let router: AuditRouter

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  await ensureAuthTables(db)
  const audit = createAuditLog(db)
  await audit.record({
    actorId: 'user-1',
    actorRoles: ['editor'],
    action: 'content.create',
    collection: 'article',
    entryId: 'entry-1',
  })
  await audit.record({
    actorId: 'user-1',
    actorRoles: ['editor'],
    action: 'content.publish',
    collection: 'article',
    entryId: 'entry-1',
  })
  await audit.record({ actorId: 'user-2', actorRoles: ['editor'], action: 'media.upload' })
  router = createAuditRouter({ audit })
})

afterEach(async () => {
  await db.close()
})

describe('GET /api/audit', () => {
  it('refuses anyone below admin', async () => {
    const response = await router.handle({ method: 'GET', path: '/api/audit', query: {} }, EDITOR)
    expect(response.status).toBe(403)

    const asAnonymous = await router.handle(
      { method: 'GET', path: '/api/audit', query: {} },
      ANONYMOUS,
    )
    expect(asAnonymous.status).toBe(403)
  })

  it('lists every entry, most recent first, for an admin', async () => {
    const response = await router.handle({ method: 'GET', path: '/api/audit', query: {} }, ADMIN)
    expect(response.status).toBe(200)
    const body = response.body as { data: { action: string }[] }
    expect(body.data.map((entry) => entry.action)).toEqual([
      'media.upload',
      'content.publish',
      'content.create',
    ])
  })

  it('filters by actor, action and collection', async () => {
    const byActor = await router.handle(
      { method: 'GET', path: '/api/audit', query: { actorId: 'user-2' } },
      ADMIN,
    )
    expect((byActor.body as { data: unknown[] }).data.length).toBe(1)

    const byAction = await router.handle(
      { method: 'GET', path: '/api/audit', query: { action: 'content.publish' } },
      ADMIN,
    )
    expect((byAction.body as { data: unknown[] }).data.length).toBe(1)

    const byCollection = await router.handle(
      { method: 'GET', path: '/api/audit', query: { collection: 'article' } },
      ADMIN,
    )
    expect((byCollection.body as { data: unknown[] }).data.length).toBe(2)
  })

  it('rejects a non-numeric limit rather than silently ignoring it', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit', query: { limit: 'a-lot' } },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })
})

describe('GET /api/audit/verify', () => {
  it('reports the chain intact', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/verify', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { ok: boolean } }).data.ok).toBe(true)
  })

  it('reports tampering as a 500 naming the chain break', async () => {
    await db.query(
      sql`update cogenta_audit_log set action = ${'tampered'} where action = ${'content.create'}`,
    )
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/verify', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(500)
    expect((response.body as { error: { code: string } }).error.code).toBe('AUDIT_CHAIN_BROKEN')
  })
})

/**
 * "Mon activité" (fiche 18 task 4): the one audit route open to anyone
 * signed in, not just `admin` — and the one whose entire safety depends on
 * the actor filter being forced server-side, never taken from the request.
 */
describe('GET /api/audit/me', () => {
  it('is open to a non-admin, unlike the full log', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/me', query: {} },
      USER_ONE,
    )
    expect(response.status).toBe(200)
  })

  it("lists only the caller's own entries, most recent first", async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/me', query: {} },
      USER_ONE,
    )
    const body = response.body as { data: { action: string; actorId: string }[] }
    expect(body.data.map((entry) => entry.action)).toEqual(['content.publish', 'content.create'])
    expect(body.data.every((entry) => entry.actorId === 'user-1')).toBe(true)
  })

  it('refuses an anonymous caller', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/me', query: {} },
      ANONYMOUS,
    )
    expect(response.status).toBe(401)
  })

  /**
   * The critical property this route exists to guarantee: a client-supplied
   * `actorId` is never honoured. Without this, `/api/audit/me?actorId=user-2`
   * would let any signed-in account read anyone else's activity — exactly
   * the leak that keeps the full log `admin`-only.
   */
  it('ignores a client-supplied actorId — it can never read someone else’s activity', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/me', query: { actorId: 'user-2' } },
      USER_ONE,
    )
    const body = response.body as { data: { action: string; actorId: string }[] }
    // Still exactly user-1's own two entries, never user-2's.
    expect(body.data.map((entry) => entry.action)).toEqual(['content.publish', 'content.create'])
    expect(body.data.every((entry) => entry.actorId === 'user-1')).toBe(true)
  })

  it('defaults to the last 20 entries and honours a smaller explicit limit', async () => {
    const capped = await router.handle(
      { method: 'GET', path: '/api/audit/me', query: { limit: '1' } },
      USER_ONE,
    )
    const body = capped.body as { data: unknown[] }
    expect(body.data).toHaveLength(1)
  })

  it('refuses POST', async () => {
    const response = await router.handle(
      { method: 'POST', path: '/api/audit/me', query: {} },
      USER_ONE,
    )
    expect(response.status).toBe(405)
  })
})
