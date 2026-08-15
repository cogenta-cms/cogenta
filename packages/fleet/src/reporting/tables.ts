import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const REPORTING_TABLES = {
  schedule: 'cogenta_fleet_report_schedule',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * Same `create table if not exists` pattern as `../control/tables.ts` — one
 * row per site's last-sent report timestamp, strictly per-site (no query
 * shape here spans more than one site's row at once).
 */
export async function ensureReportingTables(db: DatabaseHandle): Promise<void> {
  const t255 = textColumn(db.dialect, 255)
  const schedule = identifier(REPORTING_TABLES.schedule, db.dialect)
  await db.query(sql`
    create table if not exists ${schedule} (
      site_id ${t255} not null primary key,
      last_sent_at ${t255} not null
    )`)
}
