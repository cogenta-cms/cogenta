import { describe, expect, it } from 'vitest'
import { createDailySaltStore, hashSession, utcDateKey } from '../src/session-hash.js'
import { testDb } from './helpers/db.js'

describe('utcDateKey', () => {
  it('formats a timestamp as a UTC YYYY-MM-DD key', () => {
    expect(utcDateKey(Date.UTC(2026, 0, 15, 23, 59, 59))).toBe('2026-01-15')
  })
})

describe('createDailySaltStore', () => {
  it('mints a new salt the first time a day is asked for', async () => {
    const db = await testDb()
    const store = createDailySaltStore(db)
    const salt = await store.getSalt('2026-01-01')
    expect(salt).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns the same salt for the same day on repeated calls', async () => {
    const db = await testDb()
    const store = createDailySaltStore(db)
    const first = await store.getSalt('2026-01-01')
    const second = await store.getSalt('2026-01-01')
    expect(second).toBe(first)
  })

  it('mints a different salt for a different day', async () => {
    const db = await testDb()
    const store = createDailySaltStore(db)
    const day1 = await store.getSalt('2026-01-01')
    const day2 = await store.getSalt('2026-01-02')
    expect(day2).not.toBe(day1)
  })

  it('purges salts older than a cutoff and leaves newer ones', async () => {
    const db = await testDb()
    const store = createDailySaltStore(db)
    await store.getSalt('2026-01-01')
    const kept = await store.getSalt('2026-01-10')

    const removed = await store.purgeOlderThan('2026-01-05')
    expect(removed).toBe(1)

    // The kept day's salt is unaffected by the purge.
    expect(await store.getSalt('2026-01-10')).toBe(kept)
  })
})

describe('hashSession — the anti-tracking guarantee', () => {
  it('produces the same hash for the same salt, ip and device', () => {
    const a = hashSession('salt-a', '203.0.113.5', 'desktop')
    const b = hashSession('salt-a', '203.0.113.5', 'desktop')
    expect(a).toBe(b)
  })

  it('produces a different hash for a different ip', () => {
    const a = hashSession('salt-a', '203.0.113.5', 'desktop')
    const b = hashSession('salt-a', '203.0.113.6', 'desktop')
    expect(a).not.toBe(b)
  })

  it('produces a different hash for a different device category', () => {
    const a = hashSession('salt-a', '203.0.113.5', 'desktop')
    const b = hashSession('salt-a', '203.0.113.5', 'mobile')
    expect(a).not.toBe(b)
  })

  it('the daily salt makes the same visitor unrecognisable across two different days', async () => {
    const db = await testDb()
    const store = createDailySaltStore(db)

    const ip = '203.0.113.5'
    const device = 'desktop'

    const saltDay1 = await store.getSalt('2026-01-01')
    const saltDay2 = await store.getSalt('2026-01-02')

    // Same real visitor: same ip, same device, two different days.
    const hashDay1 = hashSession(saltDay1, ip, device)
    const hashDay2 = hashSession(saltDay2, ip, device)

    // The stored hashes carry no relationship an observer of the database
    // could exploit: they are unequal, and neither is derivable from the
    // other without the ip — which was never stored on either day.
    expect(hashDay1).not.toBe(hashDay2)
  })

  it('never emits the salt, the ip or the device in a form the hash reveals', () => {
    const ip = '203.0.113.5'
    const hash = hashSession('some-daily-salt', ip, 'desktop')
    expect(hash).not.toContain(ip)
    expect(hash).not.toContain('some-daily-salt')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
