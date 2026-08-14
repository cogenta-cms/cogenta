import { createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AuditRouter, createAuditRouter } from '../../src/rest/audit-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }

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
