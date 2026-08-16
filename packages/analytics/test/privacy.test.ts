import { sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createAnalyticsStore } from '../src/store.js'
import { testDb } from './helpers/db.js'

/**
 * The line the calling task named as the absolute red line: no personal data
 * stored, ever — no raw IP, no full User-Agent, no cookie, and nothing that
 * lets two different days be linked back to the same visitor. These tests
 * inspect the actual stored rows, not the public API's types, because a type
 * can promise privacy a bug still violates.
 */

const IP = '203.0.113.77'
const FULL_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; VeryUniqueBuildTag998877) AppleWebKit/537.36 Chrome/120.0.6099.199 Safari/537.36'

interface RawEventRow {
  readonly id: string
  readonly at: string
  readonly path: string
  readonly referrer_domain: string | null
  readonly device: string
  readonly session_hash: string
}

async function readAllEvents(db: Awaited<ReturnType<typeof testDb>>): Promise<RawEventRow[]> {
  const result = await db.query<RawEventRow>(sql`select * from cogenta_analytics_events`)
  return result.rows
}

describe('privacy — no personal data ever reaches storage', () => {
  it('never stores the visitor IP address in any column', async () => {
    const db = await testDb()
    const store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))
    await store.recordEvent({
      path: '/article',
      ip: IP,
      userAgent: FULL_USER_AGENT,
      referrer: `https://ref.example/?from=${IP}`,
    })

    const rows = await readAllEvents(db)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toBeDefined()
    const serialised = JSON.stringify(row)
    expect(serialised).not.toContain(IP)
  })

  it('never stores the full User-Agent string, only a fixed device category', async () => {
    const db = await testDb()
    const store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))
    await store.recordEvent({ path: '/article', ip: IP, userAgent: FULL_USER_AGENT })

    const rows = await readAllEvents(db)
    const row = rows[0]
    expect(row).toBeDefined()
    if (row === undefined) return

    expect(['desktop', 'mobile', 'tablet', 'other']).toContain(row.device)
    expect(row.device).not.toContain('VeryUniqueBuildTag998877')
    expect(JSON.stringify(row)).not.toContain('VeryUniqueBuildTag998877')
  })

  it('never stores a full referrer URL, only the referring domain', async () => {
    const db = await testDb()
    const store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))
    await store.recordEvent({
      path: '/article',
      ip: IP,
      userAgent: FULL_USER_AGENT,
      referrer: 'https://search.example/results?q=my+medical+condition&session=abc123',
    })

    const rows = await readAllEvents(db)
    const row = rows[0]
    expect(row).toBeDefined()
    if (row === undefined) return

    expect(row.referrer_domain).toBe('search.example')
    expect(JSON.stringify(row)).not.toContain('my+medical+condition')
    expect(JSON.stringify(row)).not.toContain('abc123')
  })

  it('stores no column at all that persists across a browser session (no cookie, no fixed id)', async () => {
    const db = await testDb()
    const store = createAnalyticsStore(db, () => Date.UTC(2026, 0, 15, 12, 0, 0))
    await store.recordEvent({ path: '/article', ip: IP, userAgent: FULL_USER_AGENT })

    const rows = await readAllEvents(db)
    const row = rows[0]
    expect(row).toBeDefined()
    if (row === undefined) return

    const columns = Object.keys(row)
    // Exactly the schema declared in tables.ts — nothing that could serve as a
    // persistent visitor identifier (no "cookie_id", no "client_id", no "uid").
    expect(columns.sort()).toEqual(
      ['id', 'at', 'path', 'referrer_domain', 'device', 'session_hash'].sort(),
    )
  })

  it('the daily salt makes two visits on two different days unlinkable, even to someone reading the whole table', async () => {
    const db = await testDb()
    let clock = Date.UTC(2026, 0, 1, 12, 0, 0)
    const store = createAnalyticsStore(db, () => clock)
    await store.recordEvent({ path: '/day-one', ip: IP, userAgent: FULL_USER_AGENT })

    clock = Date.UTC(2026, 0, 2, 12, 0, 0)
    await store.recordEvent({ path: '/day-two', ip: IP, userAgent: FULL_USER_AGENT })

    const rows = await readAllEvents(db)
    expect(rows).toHaveLength(2)
    const [first, second] = rows

    // Same real visitor (same ip, same UA, so same device category), two
    // different days: the stored session hashes are the only trace of
    // "who", and they must differ — there is nothing in either row, or in
    // the pair together, that identifies them as the same person.
    expect(first?.session_hash).not.toBe(second?.session_hash)
  })
})
