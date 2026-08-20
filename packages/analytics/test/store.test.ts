import { describe, expect, it } from 'vitest'
import { createAnalyticsStore } from '../src/store.js'
import { testDb } from './helpers/db.js'

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'

describe('createAnalyticsStore — recordEvent', () => {
  it('records a page view visible in the summary', async () => {
    const db = await testDb()
    const store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))

    const result = await store.recordEvent({
      path: '/blog/hello-world',
      ip: '203.0.113.5',
      userAgent: UA_DESKTOP,
      referrer: 'https://news.example/story',
      siteHost: 'my-site.example',
    })

    expect(result.recorded).toBe(true)

    const summary = await store.getSummary({ since: new Date(Date.UTC(2026, 0, 1)) })
    expect(summary.totalViews).toBe(1)
    expect(summary.topPages).toEqual([{ path: '/blog/hello-world', views: 1 }])
    expect(summary.topReferrers).toEqual([{ domain: 'news.example', views: 1 }])
    expect(summary.deviceBreakdown).toEqual([{ device: 'desktop', views: 1 }])
  })

  it('drops an event with a malformed path instead of throwing', async () => {
    const db = await testDb()
    const store = createAnalyticsStore(db)

    const result = await store.recordEvent({ path: 'not-a-path', ip: '203.0.113.5' })
    expect(result.recorded).toBe(false)

    const summary = await store.getSummary({ since: new Date(0) })
    expect(summary.totalViews).toBe(0)
  })

  it('drops events beyond the per-session rate limit instead of throwing', async () => {
    const db = await testDb()
    let clock = Date.UTC(2026, 0, 15, 12, 0, 0)
    const store = createAnalyticsStore(db, () => clock)

    const input = { path: '/', ip: '203.0.113.5', userAgent: UA_DESKTOP }
    let dropped = 0
    for (let i = 0; i < 65; i += 1) {
      clock += 100 // all inside the same 60s window
      const result = await store.recordEvent(input)
      if (!result.recorded) dropped += 1
    }

    expect(dropped).toBeGreaterThan(0)

    const summary = await store.getSummary({ since: new Date(0), until: new Date(clock + 1) })
    expect(summary.totalViews).toBeLessThan(65)
  })

  it('counts two different real visitors on the same day as two unique visitors', async () => {
    const db = await testDb()
    const store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))

    await store.recordEvent({ path: '/a', ip: '203.0.113.5', userAgent: UA_DESKTOP })
    await store.recordEvent({ path: '/b', ip: '203.0.113.6', userAgent: UA_MOBILE })

    const summary = await store.getSummary({ since: new Date(Date.UTC(2026, 0, 1)) })
    expect(summary.totalViews).toBe(2)
    expect(summary.uniqueVisitors).toBe(2)
  })

  it('counts repeat page views from the same visitor within a day as one unique visitor', async () => {
    const db = await testDb()
    const store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))

    await store.recordEvent({ path: '/a', ip: '203.0.113.5', userAgent: UA_DESKTOP })
    await store.recordEvent({ path: '/b', ip: '203.0.113.5', userAgent: UA_DESKTOP })

    const summary = await store.getSummary({ since: new Date(Date.UTC(2026, 0, 1)) })
    expect(summary.totalViews).toBe(2)
    expect(summary.uniqueVisitors).toBe(1)
  })
})

describe('createAnalyticsStore — purgeSalts', () => {
  it('deletes salts older than retainDays, keeping newer ones', async () => {
    const db = await testDb()
    let clock = Date.UTC(2026, 0, 1, 12, 0, 0)
    const store = createAnalyticsStore(db, () => clock)

    // Mints one salt per day for five distinct days.
    for (let day = 0; day < 5; day += 1) {
      await store.recordEvent({ path: '/', ip: '203.0.113.5', userAgent: UA_DESKTOP })
      clock += 24 * 60 * 60 * 1000
    }

    // `clock` now sits on day 5 (0-indexed): days 0-1 are more than 3 days
    // old, days 2-4 are not.
    const purged = await store.purgeSalts(3)
    expect(purged).toBe(2)

    // A second purge at the same instant has nothing left to remove.
    expect(await store.purgeSalts(3)).toBe(0)
  })
})

describe('createAnalyticsStore — getSummary', () => {
  it('breaks views down by day', async () => {
    const db = await testDb()
    let clock = Date.UTC(2026, 0, 1, 12, 0, 0)
    const store = createAnalyticsStore(db, () => clock)

    await store.recordEvent({ path: '/a', ip: '203.0.113.5', userAgent: UA_DESKTOP })
    clock = Date.UTC(2026, 0, 2, 12, 0, 0)
    await store.recordEvent({ path: '/a', ip: '203.0.113.5', userAgent: UA_DESKTOP })
    await store.recordEvent({ path: '/a', ip: '203.0.113.6', userAgent: UA_DESKTOP })

    const summary = await store.getSummary({
      since: new Date(Date.UTC(2026, 0, 1)),
      until: new Date(Date.UTC(2026, 0, 3)),
    })

    expect(summary.dailyViews).toEqual([
      { day: '2026-01-01', views: 1 },
      { day: '2026-01-02', views: 2 },
    ])
  })

  it('never includes an event outside the requested window', async () => {
    const db = await testDb()
    let clock = Date.UTC(2025, 0, 1, 12, 0, 0)
    const store = createAnalyticsStore(db, () => clock)
    await store.recordEvent({ path: '/old', ip: '203.0.113.5', userAgent: UA_DESKTOP })

    clock = Date.UTC(2026, 0, 15, 12, 0, 0)
    await store.recordEvent({ path: '/new', ip: '203.0.113.5', userAgent: UA_DESKTOP })

    const summary = await store.getSummary({ since: new Date(Date.UTC(2026, 0, 1)) })
    expect(summary.totalViews).toBe(1)
    expect(summary.topPages).toEqual([{ path: '/new', views: 1 }])
  })

  it('ranks top pages and top referrers by view count, descending', async () => {
    const db = await testDb()
    const store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))

    for (let i = 0; i < 3; i += 1) {
      await store.recordEvent({
        path: '/popular',
        ip: `203.0.113.${i}`,
        userAgent: UA_DESKTOP,
        referrer: 'https://big-referrer.example/x',
      })
    }
    await store.recordEvent({
      path: '/rare',
      ip: '203.0.113.9',
      userAgent: UA_DESKTOP,
      referrer: 'https://small-referrer.example/y',
    })

    const summary = await store.getSummary({ since: new Date(Date.UTC(2026, 0, 1)) })
    expect(summary.topPages[0]).toEqual({ path: '/popular', views: 3 })
    expect(summary.topPages[1]).toEqual({ path: '/rare', views: 1 })
    expect(summary.topReferrers[0]).toEqual({ domain: 'big-referrer.example', views: 3 })
  })
})
