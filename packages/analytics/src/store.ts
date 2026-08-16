import { type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { classifyDevice, type DeviceCategory } from './device.js'
import { extractReferrerDomain } from './referrer.js'
import { createDailySaltStore, hashSession, utcDateKey } from './session-hash.js'
import { TABLES } from './tables.js'
import type {
  AnalyticsSummary,
  CountedDevice,
  CountedPath,
  CountedReferrer,
  DailyViews,
  RecordEventInput,
  RecordEventResult,
  SummaryOptions,
} from './types.js'

/** Longer than this is not a path, it is an attempt to make the events table work. */
const MAX_PATH_LENGTH = 512

/**
 * How many beacons the same session hash may fire inside the window below
 * before further ones are silently dropped.
 *
 * This is abuse-resistance, not user throttling: a real visit fires exactly
 * one beacon per page view, so this only ever engages against a script
 * hammering the endpoint. It reuses the same "count recent rows for a
 * subject" shape as `@cogenta/auth`'s login rate limiter
 * (`packages/auth/src/rate-limit.ts`), sized very differently — a login limiter
 * defends a few attempts per fifteen minutes, this defends a public,
 * unauthenticated, no-op-on-abuse endpoint that must never itself break page
 * rendering, so it drops rather than throws (see `recordEvent` below).
 */
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_EVENTS = 60

export const DEFAULT_SUMMARY_LIMIT = 10

export interface AnalyticsStore {
  /**
   * Records one page view. Never throws for a malformed or abusive request —
   * a public beacon endpoint is a bonus feature (R1/R2 spirit: the site works
   * without it), so the worst an attacker or a broken client can do is have
   * their event silently dropped. `recorded: false` says which happened.
   */
  recordEvent(input: RecordEventInput, now?: number): Promise<RecordEventResult>
  getSummary(options: SummaryOptions): Promise<AnalyticsSummary>
}

export function createAnalyticsStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): AnalyticsStore {
  const events = identifier(TABLES.events, db.dialect)
  const saltStore = createDailySaltStore(db, now)

  async function withinRateLimit(sessionHash: string, at: number): Promise<boolean> {
    const since = new Date(at - RATE_LIMIT_WINDOW_MS).toISOString()
    const result = await db.query<{ n: number }>(
      sql`select count(*) as n from ${events} where session_hash = ${sessionHash} and at >= ${since}`,
    )
    return Number(result.rows[0]?.n ?? 0) < RATE_LIMIT_MAX_EVENTS
  }

  return {
    recordEvent: async (input, at) => {
      const timestamp = at ?? now()
      const path = normalisePath(input.path)
      if (path === undefined) return { recorded: false }

      const device: DeviceCategory = classifyDevice(input.userAgent)
      const referrerDomain = extractReferrerDomain(input.referrer, input.siteHost)

      const day = utcDateKey(timestamp)
      const salt = await saltStore.getSalt(day)
      const sessionHash = hashSession(salt, input.ip, device)

      if (!(await withinRateLimit(sessionHash, timestamp))) {
        return { recorded: false }
      }

      await db.query(sql`
        insert into ${events} (id, at, path, referrer_domain, device, session_hash)
        values (
          ${newId(now)},
          ${new Date(timestamp).toISOString()},
          ${path},
          ${referrerDomain ?? null},
          ${device},
          ${sessionHash}
        )`)

      return { recorded: true }
    },

    getSummary: async (options) => {
      const since = options.since
      const until = options.until ?? new Date(now())
      const sinceIso = since.toISOString()
      const untilIso = until.toISOString()
      const rowLimit = options.limit ?? DEFAULT_SUMMARY_LIMIT

      const totalResult = await db.query<{ n: number }>(sql`
        select count(*) as n from ${events} where at >= ${sinceIso} and at <= ${untilIso}`)

      const uniqueResult = await db.query<{ n: number }>(sql`
        select count(distinct session_hash) as n from ${events}
        where at >= ${sinceIso} and at <= ${untilIso}`)

      const topPagesResult = await db.query<{ path: string; n: number }>(sql`
        select path, count(*) as n from ${events}
        where at >= ${sinceIso} and at <= ${untilIso}
        group by path
        order by count(*) desc
        limit ${rowLimit}`)

      const topReferrersResult = await db.query<{ referrer_domain: string; n: number }>(sql`
        select referrer_domain, count(*) as n from ${events}
        where at >= ${sinceIso} and at <= ${untilIso} and referrer_domain is not null
        group by referrer_domain
        order by count(*) desc
        limit ${rowLimit}`)

      const deviceResult = await db.query<{ device: string; n: number }>(sql`
        select device, count(*) as n from ${events}
        where at >= ${sinceIso} and at <= ${untilIso}
        group by device
        order by count(*) desc`)

      const dailyResult = await db.query<{ day: string; n: number }>(sql`
        select substr(at, 1, 10) as day, count(*) as n from ${events}
        where at >= ${sinceIso} and at <= ${untilIso}
        group by substr(at, 1, 10)
        order by day asc`)

      const topPages: CountedPath[] = topPagesResult.rows.map((row) => ({
        path: row.path,
        views: Number(row.n),
      }))
      const topReferrers: CountedReferrer[] = topReferrersResult.rows.map((row) => ({
        domain: row.referrer_domain,
        views: Number(row.n),
      }))
      const deviceBreakdown: CountedDevice[] = deviceResult.rows.map((row) => ({
        device: row.device as DeviceCategory,
        views: Number(row.n),
      }))
      const dailyViews: DailyViews[] = dailyResult.rows.map((row) => ({
        day: row.day,
        views: Number(row.n),
      }))

      return {
        since: sinceIso,
        until: untilIso,
        totalViews: Number(totalResult.rows[0]?.n ?? 0),
        uniqueVisitors: Number(uniqueResult.rows[0]?.n ?? 0),
        topPages,
        topReferrers,
        deviceBreakdown,
        dailyViews,
      }
    },
  }
}

function normalisePath(path: string): string | undefined {
  if (typeof path !== 'string') return undefined
  const trimmed = path.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_PATH_LENGTH) return undefined
  if (!trimmed.startsWith('/')) return undefined
  return trimmed
}
