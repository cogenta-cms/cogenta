import { type DatabaseHandle, identifier, limit, sql } from '@cogenta/core'
import { normalisePath } from './router.js'

/**
 * The log of public URLs that answered a 404 (fiche 12 task 1).
 *
 * Half the point of a redirect table is knowing what to put in it, and
 * without this a CMS only learns of a broken link when a visitor or a client
 * complains. This is that missing half — but it is written by an anonymous
 * request, on every path nobody asked for, which makes it the one part of
 * this fiche that is a real attack surface rather than a convenience:
 *
 * - **One row per path, never one per request.** A second 404 at a path
 *   already tracked increments a counter; it never appends a row. Without
 *   this, a scanner requesting the same missing URL in a loop alone would
 *   grow the table without bound.
 * - **`maxPaths` is a hard cap on distinct paths.** Once it is reached, a
 *   404 at a genuinely new path is not recorded at all — existing paths keep
 *   accumulating hits, but the table cannot grow past its cap. A scanner
 *   that requests thousands of unique URLs a minute (the case one row per
 *   path alone does not defend against) hits this instead of a full disk.
 * - **`purge` drops what has not been seen in `retainDays`.** Old noise does
 *   not sit forever, and it is what frees capacity back up under the cap.
 * - **No personal data, ever.** Neither an IP address nor a user agent is a
 *   column here, full or truncated — `AGENTS.md` § Logs forbids storing
 *   either, and the path plus a same-origin-or-not referrer already answer
 *   the only question this log exists for: "what should I redirect?". The
 *   referrer itself is reduced to origin + pathname before it is kept, so a
 *   query string carrying a search term, a token or a session id never
 *   reaches this table either.
 */

export const NOT_FOUND_LOG_TABLE = 'cogenta_not_found_log'

/** Kept in step with the `varchar(512)` of the DDL below, the same way `redirects.ts` does. */
const MAX_PATH_LENGTH = 512
const MAX_REFERRER_LENGTH = 512

/** Distinct paths tracked before new ones stop being recorded, absent an explicit choice. */
export const DEFAULT_MAX_TRACKED_PATHS = 2000

export interface NotFoundLogEntry {
  readonly path: string
  readonly hits: number
  /** Epoch milliseconds. */
  readonly firstSeen: number
  /** Epoch milliseconds. */
  readonly lastSeen: number
  /** Origin + pathname only — never a query string or a fragment. Null when the request carried none, or an unparsable one. */
  readonly lastReferrer: string | null
}

export interface RecordNotFoundInput {
  readonly path: string
  readonly referrer?: string | null
}

export interface ListNotFoundOptions {
  /** Highest hit count first. Defaults to 100. */
  readonly limit?: number
}

export interface NotFoundLogStore {
  /** Creates the table if it is missing. Called for you by every other method. */
  ensureTable(): Promise<void>
  /**
   * Aggregates one public 404 by path.
   *
   * Always a no-op rather than a throw when the path is unusably long or the
   * log is already at its cap — a visitor requesting a broken link must never
   * see a 500 because this bookkeeping table is full.
   */
  record(input: RecordNotFoundInput): Promise<void>
  /** Sorted by `hits` descending, then by most recently seen. */
  list(options?: ListNotFoundOptions): Promise<readonly NotFoundLogEntry[]>
  /** Drops one tracked path — used once a redirect has been created from it, or by an editor clearing noise. */
  remove(path: string): Promise<boolean>
  /** Drops every path not requested in more than `retainDays` days. Returns how many were dropped. */
  purge(retainDays: number): Promise<number>
}

export interface NotFoundLogStoreOptions {
  readonly db: DatabaseHandle
  /** Injected so the tests do not have to wait for a clock. */
  readonly now?: () => number
  readonly table?: string
  /** Hard cap on distinct paths tracked at once. Defaults to `DEFAULT_MAX_TRACKED_PATHS`. */
  readonly maxPaths?: number
}

interface NotFoundLogRow {
  path: string
  hits: number
  first_seen: number
  last_seen: number
  last_referrer: string | null
}

/** Origin + pathname only, capped in length. `null` for anything that does not parse as an absolute URL, or is empty. */
function sanitiseReferrer(referrer: string | null | undefined): string | null {
  if (referrer === null || referrer === undefined || referrer.length === 0) return null
  try {
    const url = new URL(referrer)
    const reduced = `${url.origin}${url.pathname}`
    return reduced.slice(0, MAX_REFERRER_LENGTH)
  } catch {
    return null
  }
}

export function createNotFoundLogStore(options: NotFoundLogStoreOptions): NotFoundLogStore {
  const { db } = options
  const now = options.now ?? Date.now
  const maxPaths = options.maxPaths ?? DEFAULT_MAX_TRACKED_PATHS
  const table = identifier(options.table ?? NOT_FOUND_LOG_TABLE, db.dialect)
  let ready = false

  async function ensureTable(): Promise<void> {
    if (ready) return

    await db.query(sql`
      create table if not exists ${table} (
        path varchar(512) not null primary key,
        hits integer not null,
        first_seen bigint not null,
        last_seen bigint not null,
        last_referrer varchar(512)
      )`)

    ready = true
  }

  return {
    ensureTable,

    record: async (input: RecordNotFoundInput): Promise<void> => {
      await ensureTable()

      const path = normalisePath(input.path)
      if (path.length > MAX_PATH_LENGTH) return
      const referrer = sanitiseReferrer(input.referrer)
      const at = now()

      await db.transaction(
        async (tx) => {
          const existing = await tx.query<{ path: string }>(sql`
            select path from ${table} where path = ${path} limit ${limit(1)}`)

          if (existing.rows.length === 0) {
            // A genuinely new path: enforced against the cap so the table
            // cannot grow past it, however many unique URLs a scanner tries.
            // Best-effort — see the upsert below for what makes a race here
            // safe rather than merely unlikely.
            const counted = await tx.query<{ total: number }>(sql`
              select count(*) as ${identifier('total', db.dialect)} from ${table}`)
            const total = Number(counted.rows[0]?.total ?? 0)
            if (total >= maxPaths) return
          }

          // An upsert, not a plain insert: `{ immediate: true }` only takes a
          // real write lock on SQLite (`BEGIN IMMEDIATE`) — Postgres and MySQL
          // both discard the option and run under their default isolation, so
          // two anonymous requests hitting the same brand-new path at once can
          // both pass the `existing.rows.length === 0` check above. A plain
          // `insert` would then have the second one crash on the `path`
          // primary key — precisely the 500 a 404 log must never cause. `on
          // conflict do update` / `on duplicate key update` turns that race
          // into a safe increment instead: whichever request loses the race
          // still lands as exactly one more hit on one row, never a thrown
          // duplicate-key error.
          if (db.dialect === 'mysql') {
            await tx.query(sql`
              insert into ${table} (path, hits, first_seen, last_seen, last_referrer)
              values (${path}, 1, ${at}, ${at}, ${referrer})
              on duplicate key update
                hits = hits + 1, last_seen = ${at}, last_referrer = ${referrer}`)
          } else {
            await tx.query(sql`
              insert into ${table} (path, hits, first_seen, last_seen, last_referrer)
              values (${path}, 1, ${at}, ${at}, ${referrer})
              on conflict (path) do update set
                hits = hits + 1,
                last_seen = excluded.last_seen,
                last_referrer = excluded.last_referrer`)
          }
        },
        { immediate: true },
      )
    },

    list: async (listOptions: ListNotFoundOptions = {}): Promise<readonly NotFoundLogEntry[]> => {
      await ensureTable()

      const found = await db.query<NotFoundLogRow>(sql`
        select path, hits, first_seen, last_seen, last_referrer
        from ${table}
        order by hits desc, last_seen desc
        limit ${limit(listOptions.limit ?? 100)}`)

      return found.rows.map(toEntry)
    },

    remove: async (path: string): Promise<boolean> => {
      await ensureTable()
      const result = await db.query(sql`
        delete from ${table} where path = ${normalisePath(path)}`)
      return result.rowsAffected > 0
    },

    purge: async (retainDays: number): Promise<number> => {
      await ensureTable()
      const cutoff = now() - retainDays * 24 * 60 * 60 * 1000
      const result = await db.query(sql`delete from ${table} where last_seen < ${cutoff}`)
      return result.rowsAffected
    },
  }
}

function toEntry(row: NotFoundLogRow): NotFoundLogEntry {
  return {
    path: row.path,
    hits: Number(row.hits),
    firstSeen: Number(row.first_seen),
    lastSeen: Number(row.last_seen),
    lastReferrer: row.last_referrer,
  }
}
