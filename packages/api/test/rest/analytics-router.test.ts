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
