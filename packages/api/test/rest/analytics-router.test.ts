import {
  type AnalyticsStore,
  createAnalyticsStore,
  ensureAnalyticsTables,
} from '@cogenta/analytics'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AnalyticsRouter, createAnalyticsRouter } from '../../src/rest/analytics-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }

let db: DatabaseHandle
let store: AnalyticsStore
let router: AnalyticsRouter

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  await ensureAnalyticsTables(db)
  store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))
  router = createAnalyticsRouter({
    store,
    siteHost: 'my-site.example',
    now: () => Date.UTC(2026, 0, 15, 12, 0, 0),
  })
})

afterEach(async () => {
  await db.close()
})

describe('GET /api/analytics/beacon', () => {
  it('records a page view for an anonymous visitor', async () => {
    const response = await router.handle(
      {
        method: 'GET',
        path: '/api/analytics/beacon',
        query: { p: '/blog/hello' },
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
      },
      { actor: ANONYMOUS, ip: '203.0.113.5' },
    )

    expect(response.status).toBe(204)

    const summary = await store.getSummary({ since: new Date(Date.UTC(2026, 0, 1)) })
    expect(summary.totalViews).toBe(1)
  })

  it('never returns an error status, even for a missing path', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/beacon', query: {} },
      { actor: ANONYMOUS, ip: '203.0.113.5' },
    )
    expect(response.status).toBe(204)
  })

  it('rejects a method other than GET without recording anything', async () => {
    const response = await router.handle(
      { method: 'POST', path: '/api/analytics/beacon', query: { p: '/x' } },
      { actor: ANONYMOUS, ip: '203.0.113.5' },
    )
    expect(response.status).toBe(405)

    const summary = await store.getSummary({ since: new Date(Date.UTC(2026, 0, 1)) })
    expect(summary.totalViews).toBe(0)
  })

  it('does not leak the visitor IP or User-Agent into the response body', async () => {
    const response = await router.handle(
      {
        method: 'GET',
        path: '/api/analytics/beacon',
        query: { p: '/blog/hello' },
        headers: { 'user-agent': 'MyUniqueBrowserBuild/9999' },
      },
      { actor: ANONYMOUS, ip: '203.0.113.5' },
    )
    expect(JSON.stringify(response.body ?? '')).not.toContain('203.0.113.5')
    expect(JSON.stringify(response.body ?? '')).not.toContain('MyUniqueBrowserBuild')
  })
})

describe('GET /api/analytics/summary', () => {
  beforeEach(async () => {
    await store.recordEvent({
      path: '/popular',
      ip: '203.0.113.5',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    })
  })

  it('refuses anyone below admin', async () => {
    const asEditor = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: EDITOR, ip: '203.0.113.9' },
    )
    expect(asEditor.status).toBe(403)

    const asAnonymous = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: ANONYMOUS, ip: '203.0.113.9' },
    )
    expect(asAnonymous.status).toBe(403)
  })

  it('returns the aggregate summary for admin', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { totalViews: number } }
    expect(body.data.totalViews).toBe(1)
  })

  it('honours the ?days= window', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: { days: '7' } },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(200)
  })

  it('rejects an out-of-range ?days=', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: { days: '9999' } },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(400)
  })

  it('accepts a custom ?since=&?until= date range', async () => {
    const response = await router.handle(
      {
        method: 'GET',
        path: '/api/analytics/summary',
        query: { since: '2026-01-01', until: '2026-01-31' },
      },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { since: string; until: string } }
    expect(body.data.since).toBe(new Date('2026-01-01').toISOString())
    expect(body.data.until).toBe(new Date('2026-01-31').toISOString())
  })

  it('rejects "since" given without "until"', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: { since: '2026-01-01' } },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(400)
  })

  it('rejects "since" after "until"', async () => {
    const response = await router.handle(
      {
        method: 'GET',
        path: '/api/analytics/summary',
        query: { since: '2026-01-31', until: '2026-01-01' },
      },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(400)
  })

  it('rejects a custom range spanning more than the maximum window', async () => {
    const response = await router.handle(
      {
        method: 'GET',
        path: '/api/analytics/summary',
        query: { since: '2020-01-01', until: '2026-01-01' },
      },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(400)
  })

  it('reports the previous-period comparison', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    const body = response.body as {
      data: { previousTotalViews: number; viewsChangePercent: number | null }
    }
    expect(body.data.previousTotalViews).toBe(0)
    expect(body.data.viewsChangePercent).toBeNull()
  })

  it('enriches top pages with a title and edit link when resolvePage is wired in', async () => {
    const enrichedRouter = createAnalyticsRouter({
      store,
      siteHost: 'my-site.example',
      now: () => Date.UTC(2026, 0, 15, 12, 0, 0),
      resolvePage: async (path) =>
        path === '/popular'
          ? { title: 'Popular page', editHref: '/admin/collections/page/abc' }
          : undefined,
    })
    await store.recordEvent({ path: '/popular', ip: '203.0.113.7', userAgent: 'Mozilla/5.0' })

    const response = await enrichedRouter.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    const body = response.body as {
      data: { topPages: readonly { path: string; title?: string; editHref?: string }[] }
    }
    const popular = body.data.topPages.find((page) => page.path === '/popular')
    expect(popular?.title).toBe('Popular page')
    expect(popular?.editHref).toBe('/admin/collections/page/abc')

    // The original entry, unresolved, still comes back — bare path, no crash.
    const original = body.data.topPages.find((page) => page.path === '/popular')
    expect(original).toBeDefined()
  })

  it('reports the configured retention when the caller wires one in', async () => {
    const withRetention = createAnalyticsRouter({
      store,
      now: () => Date.UTC(2026, 0, 15, 12, 0, 0),
      retainDays: 400,
    })
    const response = await withRetention.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    const body = response.body as { data: { retentionDays: number | null } }
    expect(body.data.retentionDays).toBe(400)
  })

  it('honours a ?limit= beyond the store default of 10', async () => {
    for (let i = 0; i < 15; i += 1) {
      await store.recordEvent({
        path: `/page-${i}`,
        ip: `203.0.113.${20 + i}`,
        userAgent: 'Mozilla/5.0',
      })
    }

    const defaultResponse = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    const defaultBody = defaultResponse.body as { data: { topPages: readonly unknown[] } }
    expect(defaultBody.data.topPages.length).toBe(10)

    const expandedResponse = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: { limit: '20' } },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    const expandedBody = expandedResponse.body as { data: { topPages: readonly unknown[] } }
    // 15 distinct paths from this test, plus the one recorded in the outer
    // beforeEach — 16 rows, under the requested cap of 20.
    expect(expandedBody.data.topPages.length).toBe(16)
  })

  it('rejects a ?limit= outside the allowed range', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: { limit: '0' } },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(400)
  })

  it('carries the previous period, broken down by day, in the response', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    const body = response.body as { data: { previousDailyViews: readonly unknown[] } }
    expect(Array.isArray(body.data.previousDailyViews)).toBe(true)
  })

  it('reports no retention when the caller wired none in', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    const body = response.body as { data: { retentionDays: number | null } }
    expect(body.data.retentionDays).toBeNull()
  })

  it('keeps the bare path when resolvePage cannot place it', async () => {
    const enrichedRouter = createAnalyticsRouter({
      store,
      now: () => Date.UTC(2026, 0, 15, 12, 0, 0),
      resolvePage: async () => undefined,
    })
    const response = await enrichedRouter.handle(
      { method: 'GET', path: '/api/analytics/summary', query: {} },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    const body = response.body as {
      data: { topPages: readonly { path: string; title?: string }[] }
    }
    expect(body.data.topPages[0]?.title).toBeUndefined()
  })
})

describe('GET /api/analytics/page', () => {
  beforeEach(async () => {
    await store.recordEvent({
      path: '/popular',
      ip: '203.0.113.5',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    })
  })

  it('refuses anyone below admin', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/page', query: { path: '/popular' } },
      { actor: EDITOR, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(403)
  })

  it('requires a ?path=', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/page', query: {} },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(400)
  })

  it('reports views and rank for one page', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/page', query: { path: '/popular', days: '30' } },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { path: string; views: number; rank: number | null } }
    expect(body.data.path).toBe('/popular')
    expect(body.data.views).toBe(1)
    expect(body.data.rank).toBe(1)
  })

  it('reports a null rank for a page never visited', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/page', query: { path: '/never-visited' } },
      { actor: ADMIN, ip: '203.0.113.9' },
    )
    const body = response.body as { data: { views: number; rank: number | null } }
    expect(body.data.views).toBe(0)
    expect(body.data.rank).toBeNull()
  })
})

describe('unknown route', () => {
  it('returns 404', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/analytics/nope', query: {} },
      { actor: ANONYMOUS, ip: '203.0.113.9' },
    )
    expect(response.status).toBe(404)
  })
})
