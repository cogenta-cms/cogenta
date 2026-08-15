import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const ALERT_TABLES = {
  conditions: 'cogenta_fleet_alert_conditions',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * One row per (site, condition type) currently-or-previously-raised alert —
 * `cleared_at is null` means still active. Same `create table if not exists`
 * pattern as `../reporting/tables.ts`/`../control/tables.ts`. Strictly
 * per-site: no query here ever spans more than one site's row at once,
 * matching every other L8 store's per-site isolation discipline.
 */
export async function ensureAlertTables(db: DatabaseHandle): Promise<void> {
  const t255 = textColumn(db.dialect, 255)
  const conditions = identifier(ALERT_TABLES.conditions, db.dialect)
  await db.query(sql`
    create table if not exists ${conditions} (
      id ${t255} not null primary key,
      site_id ${t255} not null,
      condition_type ${t255} not null,
      raised_at ${t255} not null,
      cleared_at ${t255}
    )`)
}
