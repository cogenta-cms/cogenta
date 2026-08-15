import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { REPORTING_TABLES } from './tables.js'

/**
 * "Un rapport mensuel par site... planifiés" (`docs/lots/L8-flotte.md`).
 * This is the real due/not-due computation only — no live cron/scheduler is
 * wired anywhere in this codebase (the same honest "no live control-plane
 * deployment exists" scoping every other L8 task has made); a real
 * deployment calls `isReportDue` from whatever real scheduling mechanism it
 * has, the same way `packages/create-cogenta/src/playground-reset.ts`
 * (L9 task 12) is a real, callable function with no live cron wired to it
 * either.
 */
const REPORT_INTERVAL_DAYS = 30

export function isReportDue(lastSentAt: string | null, now: () => number = Date.now): boolean {
  if (lastSentAt === null) return true
  const elapsedMs = now() - new Date(lastSentAt).getTime()
  return elapsedMs >= REPORT_INTERVAL_DAYS * 24 * 60 * 60 * 1000
}

export interface ReportScheduleStore {
  /** `null` if no report has ever been recorded as sent for this site. */
  lastSentAt(siteId: string): Promise<string | null>
  /** Records that a report was sent for `siteId` at `now()` — real, idempotent (a later call simply overwrites the prior timestamp). */
  recordSent(siteId: string, now?: () => number): Promise<void>
}

interface ScheduleRow {
  site_id: string
  last_sent_at: string
}

export function createReportScheduleStore(db: DatabaseHandle): ReportScheduleStore {
  const table = identifier(REPORTING_TABLES.schedule, db.dialect)

  return {
    async lastSentAt(siteId) {
      const result = await db.query<ScheduleRow>(
        sql`select site_id, last_sent_at from ${table} where site_id = ${siteId}`,
      )
      return result.rows[0]?.last_sent_at ?? null
    },

    async recordSent(siteId, now = Date.now) {
      const sentAt = new Date(now()).toISOString()
      await db.query(sql`delete from ${table} where site_id = ${siteId}`)
      await db.query(
        sql`insert into ${table} (site_id, last_sent_at) values (${siteId}, ${sentAt})`,
      )
    },
  }
}
