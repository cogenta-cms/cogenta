import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const ROLLOUT_TABLES = {
  campaigns: 'cogenta_fleet_rollout_campaigns',
  siteStatus: 'cogenta_fleet_rollout_site_status',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

function longTextColumn(dialect: DatabaseDialect): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : 'text')
}

/** A real integer column — `current_wave_index`/`wave_index` are ordinal positions compared and incremented as numbers, never text. */
function intColumn(): SqlFragment {
  return unsafeRaw('integer')
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
 * Same `create table if not exists` pattern as `../control/tables.ts` — no
 * separate migration file. `campaigns` is one row per rollout campaign, its
 * whole wave plan persisted as JSON so a campaign genuinely survives a
 * control-plane restart ("le plan de contrôle indisponible n'affecte aucun
 * site" cuts both ways: an in-flight campaign's own state must be real,
 * durable data, never in-memory only). `site_status` is one row per
 * (campaign, site) — the real per-site version-history record a rollback
 * (task 8) needs: `pre_update_version` is what to roll back TO, not a
 * duplicate of `../control/state.ts`'s general telemetry history, which
 * tracks drift over time rather than "what this one campaign changed."
 */
export async function ensureRolloutTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const t255 = textColumn(d, 255)
  const longText = longTextColumn(d)
  const int = intColumn()

  const campaigns = identifier(ROLLOUT_TABLES.campaigns, d)
  await db.query(sql`
    create table if not exists ${campaigns} (
      id ${t255} not null primary key,
      component_kind ${t255} not null,
      component_name ${t255} not null,
      target_version ${t255} not null,
      waves_json ${longText} not null,
      current_wave_index ${int} not null,
      status ${t255} not null,
      halted_reason ${longText},
      created_at ${t255} not null
    )`)

  const siteStatus = identifier(ROLLOUT_TABLES.siteStatus, d)
  await db.query(sql`
    create table if not exists ${siteStatus} (
      id ${t255} not null primary key,
      campaign_id ${t255} not null,
      site_id ${t255} not null,
      wave_index ${int} not null,
      status ${t255} not null,
      pre_update_version ${t255},
      dispatched_at ${t255},
      resolved_at ${t255}
    )`)
  await createIndexIfMissing(
    db,
    'cogenta_fleet_rollout_site_status_campaign',
    siteStatus,
    sql`(campaign_id, site_id)`,
  )
}
