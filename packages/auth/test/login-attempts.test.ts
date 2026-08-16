import { sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../src/rate-limit.js'
import { testDb } from './helpers/db.js'

/**
 * L14 task 4 — the read side of a table that has been written to since L2 and
 * never read by anything but the limiter's own counter.
 */
describe('recentFailures', () => {
  it('says nothing about a site nobody is attacking', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    for (let i = 0; i < 3; i += 1) await limiter.record('alice@example.com')

    expect(await limiter.recentFailures()).toEqual([])
  })

  it('reports a subject once the attempts cross the first backoff threshold', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const limiter = createRateLimiter(db, () => clock)
    for (let i = 0; i < 7; i += 1) {
      await limiter.record('alice@example.com')
      clock += 1_000
    }

    const [summary] = await limiter.recentFailures()

    expect(summary).toMatchObject({
      subject: 'alice@example.com',
      attempts: 7,
      blocked: true,
    })
    expect(summary?.firstAt).not.toBe(summary?.lastAt)
  })

  it('orders the worst offender first', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    for (let i = 0; i < 6; i += 1) await limiter.record('quiet@example.com')
    for (let i = 0; i < 30; i += 1) await limiter.record('hammered@example.com')

    const summaries = await limiter.recentFailures()

    expect(summaries.map((summary) => summary.subject)).toEqual([
      'hammered@example.com',
      'quiet@example.com',
    ])
  })

  it('honours a caller that wants a lower or higher bar', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    for (let i = 0; i < 3; i += 1) await limiter.record('alice@example.com')

    expect(await limiter.recentFailures({ minAttempts: 2 })).toHaveLength(1)
    expect(await limiter.recentFailures({ minAttempts: 50 })).toHaveLength(0)
    // Below the backoff threshold, so `blocked` is false even though it is reported.
    expect((await limiter.recentFailures({ minAttempts: 2 }))[0]?.blocked).toBe(false)
  })

  it('ignores attempts that have fallen out of the window', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const limiter = createRateLimiter(db, () => clock)
    for (let i = 0; i < 10; i += 1) await limiter.record('alice@example.com')

    clock += 16 * 60 * 1000
    expect(await limiter.recentFailures()).toEqual([])
  })

  it('prunes what has fallen out of the window, so the table cannot grow for ever', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const limiter = createRateLimiter(db, () => clock)
    // A subject that never succeeds is never `clear`ed, so nothing else in the
    // limiter ever deletes these rows.
    for (let i = 0; i < 10; i += 1) await limiter.record('attacker@example.com')
    clock += 16 * 60 * 1000

    await limiter.recentFailures()

    const rows = await db.query<{ n: number }>(
      sql`select count(*) as n from cogenta_login_attempts`,
    )
    expect(Number(rows.rows[0]?.n ?? -1)).toBe(0)
  })

  it('keeps the second-factor limits apart from the password one', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    for (let i = 0; i < 6; i += 1) await limiter.record('alice@example.com')
    for (let i = 0; i < 6; i += 1) await limiter.record('mfa:user-1')

    expect((await limiter.recentFailures()).map((summary) => summary.subject).sort()).toEqual([
      'alice@example.com',
      'mfa:user-1',
    ])
  })
})
