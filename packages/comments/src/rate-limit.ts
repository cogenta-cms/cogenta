import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { toInt } from './rows.js'
import { TABLES } from './tables.js'

/**
 * Rate limiting for `POST /api/comments` — the fiche's own requirement,
 * "mandatory from the first version", on two independent dimensions kept in
 * one table (`kind` distinguishes them):
 *
 * - **by IP** (`kind: 'ip'`, subject the hashed IP): stops one visitor
 *   flooding the whole site.
 * - **by target** (`kind: 'target'`, subject `collection:entryId`): stops a
 *   distributed flood (many IPs) against one popular entry, which an
 *   IP-only limiter cannot see at all.
 *
 * Same shape as `@cogenta/auth`'s `RateLimiter` (`packages/auth/src/rate-limit.ts`)
 * — a DB-backed sliding window, no external service (R1) — copied rather than
 * shared because contract F's storage is deliberately independent of
 * `@cogenta/auth`'s tables (ADR-0025).
 */

const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_IP_PER_WINDOW = 5
const MAX_PER_TARGET_PER_WINDOW = 20

export const COMMENT_RATE_LIMIT_WINDOW_MS = WINDOW_MS

export interface CommentRateLimiter {
  /** Throws `COMMENT_RATE_LIMITED` if either dimension is over its budget. Records nothing by itself. */
  check(dimensions: { readonly ipHash: string | null; readonly target: string }): Promise<void>
  record(dimensions: { readonly ipHash: string | null; readonly target: string }): Promise<void>
}

export function createCommentRateLimiter(
  db: DatabaseHandle,
  now: () => number = Date.now,
): CommentRateLimiter {
  const table = identifier(TABLES.postAttempts, db.dialect)

  async function countRecent(kind: string, subject: string): Promise<number> {
    const since = new Date(now() - WINDOW_MS).toISOString()
    const result = await db.query<{ n: number }>(
      sql`select count(*) as n from ${table} where kind = ${kind} and subject = ${subject} and at >= ${since}`,
    )
    return toInt(result.rows[0]?.n ?? 0, 'count')
  }

  return {
    check: async ({ ipHash, target }) => {
      if (ipHash !== null) {
        const perIp = await countRecent('ip', ipHash)
        if (perIp >= MAX_PER_IP_PER_WINDOW) throw rateLimited(WINDOW_MS)
      }
      const perTarget = await countRecent('target', target)
      if (perTarget >= MAX_PER_TARGET_PER_WINDOW) throw rateLimited(WINDOW_MS)
    },

    record: async ({ ipHash, target }) => {
      const at = new Date(now()).toISOString()
      if (ipHash !== null) {
        await db.query(
          sql`insert into ${table} (id, kind, subject, at) values (${newId(now)}, 'ip', ${ipHash}, ${at})`,
        )
      }
      await db.query(
        sql`insert into ${table} (id, kind, subject, at) values (${newId(now)}, 'target', ${target}, ${at})`,
      )
    },
  }
}

function rateLimited(windowMs: number): CogentaError {
  return new CogentaError({
    code: 'COMMENT_RATE_LIMITED',
    message: 'Too many comments submitted recently.',
    hint: `Wait a few minutes and try again (limit resets over a ${Math.round(windowMs / 60_000)}-minute window).`,
    details: { windowMs },
  })
}
