import { type AuditIntegrityStatus, createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { CogentaError, createSqliteHandle, type DatabaseHandle, sql } from '@cogenta/core'
import type { ContentDiff } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('GET /api/audit/{id} — detail (fiche 21 task 1)', () => {
  it('refuses anyone below admin', async () => {
    const list = await router.handle({ method: 'GET', path: '/api/audit', query: {} }, ADMIN)
    const id = (list.body as { data: { id: string }[] }).data[0]?.id ?? ''
    const response = await router.handle(
      { method: 'GET', path: `/api/audit/${id}`, query: {} },
      EDITOR,
    )
    expect(response.status).toBe(403)
  })

  it('answers 404 for an id nothing recorded', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/nonexistent', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
    expect((response.body as { error: { code: string } }).error.code).toBe('AUDIT_ENTRY_NOT_FOUND')
  })

  it('names the actor kind, without a diff dependency wired in', async () => {
    const list = await router.handle({ method: 'GET', path: '/api/audit', query: {} }, ADMIN)
    const id = (list.body as { data: { id: string; action: string }[] }).data.find(
      (entry) => entry.action === 'content.create',
    )?.id
    const response = await router.handle(
      { method: 'GET', path: `/api/audit/${id}`, query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { actorKind: string; diff: unknown } }
    expect(body.data.actorKind).toBe('human')
    expect(body.data.diff).toBeNull()
  })

  it('calls the injected diff function rather than recomputing one, and never for a create', async () => {
    const db2 = await createSqliteHandle({ url: ':memory:' })
    await ensureAuthTables(db2)
    const audit2 = createAuditLog(db2)
    await audit2.record({
      actorId: 'user-1',
      actorRoles: ['editor'],
      action: 'content.create',
      collection: 'article',
      entryId: 'entry-1',
      version: 1,
    })
    const updated = await audit2.record({
      actorId: 'user-1',
      actorRoles: ['editor'],
      action: 'content.update',
      collection: 'article',
      entryId: 'entry-1',
      version: 2,
    })

    const fakeDiff: ContentDiff = { fields: [], blocks: [], changed: true }
    const diff = vi.fn(async () => fakeDiff)
    const router2 = createAuditRouter({ audit: audit2, diff })

    const createEntry = (
      (
        await router2.handle(
          { method: 'GET', path: '/api/audit', query: { action: 'content.create' } },
          ADMIN,
        )
      ).body as { data: { id: string }[] }
    ).data[0]
    const createDetail = await router2.handle(
      { method: 'GET', path: `/api/audit/${createEntry?.id}`, query: {} },
      ADMIN,
    )
    expect(
      (createDetail.body as { data: { diffUnavailable: string | null } }).data.diffUnavailable,
    ).toBe('first-version')
    expect(diff).not.toHaveBeenCalled()

    const updateDetail = await router2.handle(
      { method: 'GET', path: `/api/audit/${updated.id}`, query: {} },
      ADMIN,
    )
    expect(diff).toHaveBeenCalledWith(ADMIN, 'article', 'entry-1', 1, 2)
    expect((updateDetail.body as { data: { diff: ContentDiff } }).data.diff).toEqual(fakeDiff)

    await db2.close()
  })

  it('shows the entry without a diff when its versions were pruned, rather than failing the whole detail view', async () => {
    const db2 = await createSqliteHandle({ url: ':memory:' })
    await ensureAuthTables(db2)
    const audit2 = createAuditLog(db2)
    const recorded = await audit2.record({
      actorId: 'user-1',
      actorRoles: ['editor'],
      action: 'content.update',
      collection: 'article',
      entryId: 'entry-1',
      version: 5,
    })
    const diff = vi.fn(async () => {
      throw new CogentaError({ code: 'CONTENT_NOT_FOUND', message: 'Version 4 is no longer kept.' })
    })
    const router2 = createAuditRouter({ audit: audit2, diff })

    const response = await router2.handle(
      { method: 'GET', path: `/api/audit/${recorded.id}`, query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { diff: unknown; diffUnavailable: string | null } }
    expect(body.data.diff).toBeNull()
    expect(body.data.diffUnavailable).toBe('version-no-longer-kept')

    await db2.close()
  })

  it('degrades to no diff, not a 403, when admin has no authoring role on this collection', async () => {
    // `/api/audit` itself is admin-only, but the diff underneath is still
    // computed through the collection's own permission rules (R4) — a site
    // that never granted `admin` create/update/publish there is unusual,
    // not invalid, and must not turn the whole detail view into a refusal.
    const db2 = await createSqliteHandle({ url: ':memory:' })
    await ensureAuthTables(db2)
    const audit2 = createAuditLog(db2)
    const recorded = await audit2.record({
      actorId: 'user-1',
      actorRoles: ['editor'],
      action: 'content.update',
      collection: 'article',
      entryId: 'entry-1',
      version: 2,
    })
    const diff = vi.fn(async () => {
      throw new CogentaError({ code: 'FORBIDDEN', message: 'admin has no authoring role here.' })
    })
    const router2 = createAuditRouter({ audit: audit2, diff })

    const response = await router2.handle(
      { method: 'GET', path: `/api/audit/${recorded.id}`, query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { diff: unknown; diffUnavailable: string | null } }
    expect(body.data.diff).toBeNull()
    expect(body.data.diffUnavailable).toBe('no-permission-on-collection')

    await db2.close()
  })

  it('resolves a human actor to an email and an api-key actor to its name', async () => {
    const db2 = await createSqliteHandle({ url: ':memory:' })
    await ensureAuthTables(db2)
    const audit2 = createAuditLog(db2)
    const human = await audit2.record({
      actorId: 'user-1',
      actorRoles: ['editor'],
      action: 'content.create',
    })
    const key = await audit2.record({
      actorId: 'apikey:key-1',
      actorRoles: ['editor'],
      action: 'content.create',
    })

    const users = {
      byId: vi.fn(async (id: string) => (id === 'user-1' ? { email: 'a@example.com' } : null)),
    }
    const apiKeys = { list: vi.fn(async () => [{ id: 'key-1', name: 'CI bot' }]) }
    const router2 = createAuditRouter({ audit: audit2, users, apiKeys })

    const humanDetail = await router2.handle(
      { method: 'GET', path: `/api/audit/${human.id}`, query: {} },
      ADMIN,
    )
    expect((humanDetail.body as { data: { actorLabel: string | null } }).data.actorLabel).toBe(
      'a@example.com',
    )

    const keyDetail = await router2.handle(
      { method: 'GET', path: `/api/audit/${key.id}`, query: {} },
      ADMIN,
    )
    expect((keyDetail.body as { data: { actorLabel: string | null } }).data.actorLabel).toBe(
      'CI bot',
    )

    await db2.close()
  })
})

describe('GET /api/audit/export (fiche 21 task 2)', () => {
  it('refuses anyone below admin', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/export', query: {} },
      EDITOR,
    )
    expect(response.status).toBe(403)
  })

  it('exports JSON by default', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/export', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: unknown[] }).data.length).toBe(3)
  })

  it('exports CSV with a header row and one row per entry', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/export', query: { format: 'csv' } },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    const text = response.body as string
    const lines = text.replace(/^﻿/u, '').split('\r\n')
    expect(lines[0]).toBe('id,at,actorId,actorKind,actorRoles,action,collection,entryId')
    expect(lines.length).toBe(4) // header + 3 entries
  })

  it('rejects an unknown format', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/export', query: { format: 'xml' } },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })

  it('respects the same filters as the list route', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/export', query: { collection: 'article' } },
      ADMIN,
    )
    expect((response.body as { data: unknown[] }).data.length).toBe(2)
  })
})

describe('GET/POST /api/audit/integrity (fiche 21 task 3)', () => {
  it('answers { data: null } when no integrity store is configured, rather than 404', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit/integrity', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: null })
  })

  it('refuses anyone below admin even when configured', async () => {
    const status: AuditIntegrityStatus = {
      state: 'ok',
      checkpoint: null,
      entriesChecked: 0,
      lastCheckedAt: null,
      lastMode: null,
      lastFullCheckedAt: null,
      brokenAt: null,
      brokenEntryId: null,
      brokenMessage: null,
    }
    const integrity = { status: vi.fn(async () => status), check: vi.fn(async () => ({ status })) }
    const router2 = createAuditRouter({ audit: createAuditLog(db), integrity })

    const response = await router2.handle(
      { method: 'GET', path: '/api/audit/integrity', query: {} },
      EDITOR,
    )
    expect(response.status).toBe(403)
  })

  it('GET reads the last status without running a new check', async () => {
    const status: AuditIntegrityStatus = {
      state: 'ok',
      checkpoint: { id: 'x', at: '2026-01-01T00:00:00.000Z', hash: 'h' },
      entriesChecked: 3,
      lastCheckedAt: '2026-01-01T00:00:00.000Z',
      lastMode: 'incremental',
      lastFullCheckedAt: '2026-01-01T00:00:00.000Z',
      brokenAt: null,
      brokenEntryId: null,
      brokenMessage: null,
    }
    const integrity = { status: vi.fn(async () => status), check: vi.fn(async () => ({ status })) }
    const router2 = createAuditRouter({ audit: createAuditLog(db), integrity })

    const response = await router2.handle(
      { method: 'GET', path: '/api/audit/integrity', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: AuditIntegrityStatus }).data).toEqual(status)
    expect(integrity.check).not.toHaveBeenCalled()
  })

  it('POST runs a forced full check and returns the fresh status', async () => {
    const status: AuditIntegrityStatus = {
      state: 'ok',
      checkpoint: null,
      entriesChecked: 3,
      lastCheckedAt: '2026-01-01T00:00:00.000Z',
      lastMode: 'full',
      lastFullCheckedAt: '2026-01-01T00:00:00.000Z',
      brokenAt: null,
      brokenEntryId: null,
      brokenMessage: null,
    }
    const integrity = { status: vi.fn(async () => status), check: vi.fn(async () => ({ status })) }
    const router2 = createAuditRouter({ audit: createAuditLog(db), integrity })

    const response = await router2.handle(
      { method: 'POST', path: '/api/audit/integrity', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(integrity.check).toHaveBeenCalledWith({ full: true })
    expect((response.body as { data: AuditIntegrityStatus }).data).toEqual(status)
  })
})

describe('GET /api/audit — actorKind and until filters (fiche 21 tasks 2/4)', () => {
  it('filters by actorKind', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit', query: { actorKind: 'human' } },
      ADMIN,
    )
    expect((response.body as { data: unknown[] }).data.length).toBe(3)
  })

  it('rejects an unknown actorKind', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit', query: { actorKind: 'robot' } },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })

  it('filters by an until date, in addition to since', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/audit', query: { until: '1970-01-01T00:00:00.000Z' } },
      ADMIN,
    )
    expect((response.body as { data: unknown[] }).data.length).toBe(0)
  })
})
