import { type DatabaseHandle, identifier, isCogentaError, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRateLimiter, LOGIN_ATTEMPT_WINDOW_MS, type RateLimiter } from '../src/rate-limit.js'
import { ensureAuthTables, TABLES } from '../src/tables.js'

export interface RateLimitHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

/** The `retryAfterMs` a refused call announces; fails if it was not refused. */
async function retryAfterMs(attempt: () => Promise<void>): Promise<number> {
  try {
    await attempt()
  } catch (error) {
    if (isCogentaError(error) && error.code === 'AUTH_RATE_LIMITED') {
      const announced = error.details?.retryAfterMs
      if (typeof announced === 'number') return announced
    }
    throw error
  }
  throw new Error('expected the attempt to be refused')
}

/**
 * The announced `Retry-After` of a refused sign-in, written once and run against
 * SQLite as a unit test and against Postgres, MySQL and MariaDB as integration
 * tests: it picks the attempt that must age out with `order by ... limit 1
 * offset N`, and a clock injected into every statement proves the boundary to
 * the millisecond.
 */
export function runRateLimitContract(name: string, create: () => Promise<RateLimitHarness>): void {
  describe(`RateLimiter announced wait — ${name}`, () => {
    const start = 1_000_000
    let clock = start
    let harness: RateLimitHarness
    let limiter: RateLimiter

    beforeEach(async () => {
      harness = await create()
      clock = start
      await ensureAuthTables(harness.db)
      await harness.db.query(
        sql`delete from ${identifier(TABLES.loginAttempts, harness.db.dialect)}`,
      )
      limiter = createRateLimiter(harness.db, () => clock)
    })

    afterEach(async () => {
      await harness.db.close()
      await harness.dispose?.()
    })

    it('announces the wait until the subject is really allowed again, and not a moment sooner', async () => {
      for (let i = 0; i < 20; i += 1) await limiter.record('alice@example.com')

      const announced = await retryAfterMs(() => limiter.check('alice@example.com'))
      // Twenty attempts all made at once: the window has to run out entirely.
      expect(announced).toBe(LOGIN_ATTEMPT_WINDOW_MS + 1)

      clock = start + announced - 1
      await expect(limiter.check('alice@example.com')).rejects.toSatisfy(isCogentaError)
      clock = start + announced
      await expect(limiter.check('alice@example.com')).resolves.toBeUndefined()
    })

    it('counts the wait from the attempt that must age out, not from the latest one', async () => {
      // Seven attempts a minute apart: two more than the five tolerated, so the
      // three oldest must leave the window before another is allowed.
      for (let i = 0; i < 7; i += 1) {
        clock = start + i * 60_000
        await limiter.record('alice@example.com')
      }

      const announced = await retryAfterMs(() => limiter.check('alice@example.com'))
      expect(clock + announced).toBe(start + 2 * 60_000 + LOGIN_ATTEMPT_WINDOW_MS + 1)

      const refusedUntil = clock + announced
      clock = refusedUntil - 1
      await expect(limiter.check('alice@example.com')).rejects.toSatisfy(isCogentaError)
      clock = refusedUntil
      await expect(limiter.check('alice@example.com')).resolves.toBeUndefined()
    })

    it('announces a wait that clears a reserved attempt that was refused', async () => {
      for (let i = 0; i < 5; i += 1) await limiter.reserve('alice@example.com')

      const announced = await retryAfterMs(() => limiter.reserve('alice@example.com'))
      // The refused sixth attempt is itself on record, so it is counted too.
      expect(announced).toBe(LOGIN_ATTEMPT_WINDOW_MS + 1)
      clock = start + announced
      await expect(limiter.check('alice@example.com')).resolves.toBeUndefined()
    })

    it('tells the caller to wait for the account limit when the account, not the place, refused it', async () => {
      // Sixteen guesses from four addresses, a minute apart: no address is past
      // its own five, but the account is past three times that.
      for (let i = 0; i < 15; i += 1) {
        clock = start + i * 60_000
        await limiter.reserveScoped('alice@example.com', `ip-${i % 4}`, 3)
      }
      clock = start + 15 * 60_000 - 1
      const announced = await retryAfterMs(() =>
        limiter.reserveScoped('alice@example.com', 'ip-3', 3),
      )
      // Fifteen counted, so the two oldest of the sixteen must leave.
      expect(clock + announced).toBe(start + 60_000 + LOGIN_ATTEMPT_WINDOW_MS + 1)
    })
  })
}
