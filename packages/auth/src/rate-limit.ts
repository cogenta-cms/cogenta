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

/** How long failed attempts keep counting. Exported so a reader shares the exact window. */
export const LOGIN_ATTEMPT_WINDOW_MS = WINDOW_MS

/** The number of attempts past which a subject is being backed off at all. */
const FIRST_THRESHOLD = THRESHOLDS[0]?.attempts ?? 5

/**
 * What the failed attempts inside the window add up to, for one subject
 * (L14 task 4).
 *
 * The table has been written to since L2 and never read by anything but the
 * limiter's own counter, so "somebody is hammering this site" was information
 * the site had and never showed anyone.
 */
export interface LoginAttemptSummary {
  /** The email tried, or `mfa:<id>` / `totp-setup:<id>` for the second-factor limits. */
  readonly subject: string
  readonly attempts: number
  readonly firstAt: string
  readonly lastAt: string
  /** True when the attempts have crossed a backoff threshold. */
  readonly blocked: boolean
}

export interface RateLimiter {
  /** Throws `AUTH_RATE_LIMITED` if the subject is currently backed off. */
  check(subject: string): Promise<void>
  record(subject: string): Promise<void>
  /** Called after a successful login: past failures stop counting against them. */
  clear(subject: string): Promise<void>
  /**
   * Failed attempts still inside the window, worst first.
   *
   * Also prunes everything that has fallen out of the window. Nothing else
   * ever deletes a row for a subject that never went on to succeed — `clear`
   * only runs after a *successful* sign-in — so without this the table grows
   * for as long as a script keeps guessing, which is exactly the case where it
   * grows fastest.
   */
  recentFailures(options?: {
    /** Ignore subjects below this count. Defaults to the first backoff threshold. */
    readonly minAttempts?: number
    readonly limit?: number
  }): Promise<readonly LoginAttemptSummary[]>
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

    recentFailures: async (options) => {
      const since = new Date(now() - WINDOW_MS).toISOString()
      const minAttempts = options?.minAttempts ?? FIRST_THRESHOLD
      const limit = options?.limit ?? 20

      // Pruned before counting, not after: a row outside the window can never
      // change an answer, so deleting it first keeps the aggregate honest even
      // if the delete and the select were to see slightly different clocks.
      await db.query(sql`delete from ${table} where at < ${since}`)

      const result = await db.query<{
        subject: string
        n: number
        first_at: string
        last_at: string
      }>(sql`
        select subject, count(*) as n, min(at) as first_at, max(at) as last_at
        from ${table}
        where at >= ${since}
        group by subject
        order by count(*) desc`)

      return result.rows
        .map((row) => ({
          subject: row.subject,
          attempts: Number(row.n),
          firstAt: row.first_at,
          lastAt: row.last_at,
          blocked: Number(row.n) >= FIRST_THRESHOLD,
        }))
        .filter((summary) => summary.attempts >= minAttempts)
        .slice(0, limit)
    },
  }
}
