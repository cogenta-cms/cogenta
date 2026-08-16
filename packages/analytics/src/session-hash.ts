import { createHash, randomBytes } from 'node:crypto'
import { CogentaError, type DatabaseHandle, identifier, sql } from '@cogenta/core'

/**
 * The privacy core of this package.
 *
 * `sessionHash = sha256(dailySalt | ip | deviceCategory)`. It stands in for a
 * visitor without ever storing a cookie, an IP address, or any other
 * persistent identifier:
 *
 * - The IP address is only ever used as an *input* to the hash, in memory,
 *   for the single request being recorded. It is never written to a row.
 * - `dailySalt` is a random value minted once per calendar day (UTC) and
 *   never reused across days. Because the salt changes, the *same* visitor
 *   (same IP, same device) produces a *different*, unrelated hash on every
 *   new day — there is no way to compute "was this the same person as
 *   yesterday" from the stored data, even with full database access, because
 *   recomputing yesterday's hash needs yesterday's IP, which was never kept.
 * - Two different visitors on the same day get different hashes (barring a
 *   SHA-256 collision), which is what makes the hash usable for counting
 *   unique visitors *within* one day.
 *
 * This is the whole mechanism: no cookie is ever set, and nothing links one
 * day's traffic to the next.
 */

const TABLE = 'cogenta_analytics_daily_salts'

export function dailySaltTableName(): string {
  return TABLE
}

export async function ensureDailySaltTable(db: DatabaseHandle): Promise<void> {
  const table = identifier(TABLE, db.dialect)
  await db.query(sql`
    create table if not exists ${table} (
      day text not null primary key,
      salt text not null,
      created_at text not null
    )`)
}

/** `YYYY-MM-DD`, always UTC so the salt's day boundary never depends on server timezone. */
export function utcDateKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

export interface DailySaltStore {
  /** Returns today's salt, minting and persisting one the first time it is asked for. */
  getSalt(day: string): Promise<string>
  /**
   * Deletes salts older than `retainDays`. Not load-bearing for the
   * cross-day-unlinkability guarantee above (a stale salt alone cannot be
   * turned back into an IP address) — this exists as defence in depth, so a
   * database that is kept around for a long time does not accumulate salts
   * it no longer has any use for.
   */
  purgeOlderThan(cutoffDay: string): Promise<number>
}

export function createDailySaltStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): DailySaltStore {
  const table = identifier(TABLE, db.dialect)

  return {
    getSalt: async (day) => {
      const existing = await db.query<{ salt: string }>(
        sql`select salt from ${table} where day = ${day}`,
      )
      const found = existing.rows[0]
      if (found !== undefined) return found.salt

      const salt = randomBytes(32).toString('hex')
      try {
        await db.query(
          sql`insert into ${table} (day, salt, created_at) values (${day}, ${salt}, ${new Date(now()).toISOString()})`,
        )
        return salt
      } catch {
        // Lost a race with another request minting the same day's salt first —
        // read back what won, rather than every concurrent request minting
        // its own (which would silently split one day into several cohorts).
        const raced = await db.query<{ salt: string }>(
          sql`select salt from ${table} where day = ${day}`,
        )
        const winner = raced.rows[0]
        if (winner !== undefined) return winner.salt
        throw new CogentaError({
          code: 'ANALYTICS_SALT_UNAVAILABLE',
          message: `Could not read back the daily salt for ${day} after an insert conflict.`,
          hint: 'This should only happen under a database fault mid-write. Retry the request; if it keeps happening, check the database connection.',
          details: { day },
        })
      }
    },

    purgeOlderThan: async (cutoffDay) => {
      const result = await db.query(sql`delete from ${table} where day < ${cutoffDay}`)
      return result.rowsAffected
    },
  }
}

/** `sha256(salt | ip | device)`, hex-encoded. Never reversible back to the IP without the salt *and* the original IP. */
export function hashSession(salt: string, ip: string, device: string): string {
  return createHash('sha256').update(`${salt}|${ip}|${device}`, 'utf8').digest('hex')
}
