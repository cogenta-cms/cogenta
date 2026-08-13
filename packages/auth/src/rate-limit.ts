import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { TABLES } from './tables.js'

/**
 * Backoff on login attempts, keyed by subject — the email tried, or the caller's
 * IP when the email itself is what needs protecting from enumeration.
 *
 * Progressive, not a hard cap: five attempts inside a minute is a typo, thirty
 * is a script. The delay is what makes a script expensive without locking a
 * real person out of their own account after one bad guess.
 */
const WINDOW_MS = 15 * 60 * 1000
const THRESHOLDS: readonly { readonly attempts: number; readonly delayMs: number }[] = [
  { attempts: 5, delayMs: 1_000 },
  { attempts: 10, delayMs: 10_000 },
  { attempts: 15, delayMs: 60_000 },
  { attempts: 20, delayMs: 15 * 60 * 1000 },
]

export interface RateLimiter {
  /** Throws `AUTH_RATE_LIMITED` if the subject is currently backed off. */
  check(subject: string): Promise<void>
  record(subject: string): Promise<void>
  /** Called after a successful login: past failures stop counting against them. */
  clear(subject: string): Promise<void>
}

export function createRateLimiter(db: DatabaseHandle, now: () => number = Date.now): RateLimiter {
  const table = identifier(TABLES.loginAttempts, db.dialect)

  async function countRecent(subject: string): Promise<number> {
    const since = new Date(now() - WINDOW_MS).toISOString()
    const result = await db.query<{ n: number }>(
      sql`select count(*) as n from ${table} where subject = ${subject} and at >= ${since}`,
    )
    return Number(result.rows[0]?.n ?? 0)
  }

  return {
    check: async (subject) => {
      const attempts = await countRecent(subject)
      const threshold = [...THRESHOLDS].reverse().find((entry) => attempts >= entry.attempts)
      if (threshold === undefined) return

      throw new CogentaError({
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many attempts. Try again later.',
        hint: `Wait about ${Math.ceil(threshold.delayMs / 1000)} seconds before trying again, or use a passkey, which this limit does not slow down.`,
        details: { retryAfterMs: threshold.delayMs },
      })
    },

    record: async (subject) => {
      await db.query(sql`
        insert into ${table} (id, subject, at) values (${newId(now)}, ${subject}, ${new Date(now()).toISOString()})`)
    },

    clear: async (subject) => {
      await db.query(sql`delete from ${table} where subject = ${subject}`)
    },
  }
}
