import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const CONTROL_TABLES = {
  telemetrySnapshots: 'cogenta_fleet_telemetry_snapshots',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

function longTextColumn(dialect: DatabaseDialect): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : 'text')
}

async function createIndexIfMissing(
  db: DatabaseHandle,
  name: string,
  table: SqlFragment,
  columns: SqlFragment,
): Promise<void> {
  await db
    .query(sql`create index ${identifier(name, db.dialect)} on ${table} ${columns}`)
    .catch(() => undefined) // already there — no portable "if not exists" for indexes
}

/**
 * Owned by `@cogenta/fleet`'s control-plane side, same `create table if not
 * exists` pattern as `./enrollment/tables.ts`'s `ensureFleetTables` — no
 * separate migration file. One row per ingested, verified telemetry
 * snapshot, keyed strictly by `site_id` — there is no table, index or query
 * shape anywhere in `@cogenta/fleet` that spans more than one site's rows at
 * once (`./state.ts`'s real API only ever takes a single `siteId`), which is
 * what "keyed and scoped per-site from day one, structurally" means in
 * practice: not a convention a caller is expected to honour, a shape that
 * makes a cross-site query awkward to even attempt.
 */
export async function ensureControlTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const t255 = textColumn(d, 255)
  const payloadColumn = longTextColumn(d)

  const snapshots = identifier(CONTROL_TABLES.telemetrySnapshots, d)
  await db.query(sql`
    create table if not exists ${snapshots} (
      id ${t255} not null primary key,
      site_id ${t255} not null,
      collected_at ${t255} not null,
      ingested_at ${t255} not null,
      payload_json ${payloadColumn} not null
    )`)
  await createIndexIfMissing(
    db,
    'cogenta_fleet_telemetry_snapshots_site',
    snapshots,
    sql`(site_id, collected_at)`,
  )
}
