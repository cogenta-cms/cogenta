import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const PREFERENCE_TABLES = {
  preferences: 'cogenta_channel_preferences',
  pending: 'cogenta_channel_pending_notifications',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * Owned by `@cogenta/channels`, same `create table if not exists` pattern as
 * `ensureChannelTables` (`../linking/tables.js`) — no separate migration
 * file, a fresh install and an upgrade take the same path.
 */
export async function ensurePreferenceTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const preferences = identifier(PREFERENCE_TABLES.preferences, d)
  const pending = identifier(PREFERENCE_TABLES.pending, d)
  const t64 = textColumn(d, 64)
  const t255 = textColumn(d, 255)
  const int = unsafeRaw('integer')

  await db.query(sql`
    create table if not exists ${preferences} (
      id ${t64} not null primary key,
      user_id ${t64} not null,
      channel_name ${t64} not null,
      -- Comma-joined ChannelEventTypes (types.ts) — an open, but real,
      -- typed set, not free text.
      event_types ${t255} not null,
      min_severity ${t64} not null,
      quiet_start_minute ${int},
      quiet_end_minute ${int},
      grouping ${t64} not null,
      updated_at ${t64} not null
    )`)

  await createIndexIfMissing(
    db,
    'cogenta_channel_preferences_lookup',
    preferences,
    sql`(user_id, channel_name)`,
    true,
  )

  await db.query(sql`
    create table if not exists ${pending} (
      id ${t64} not null primary key,
      user_id ${t64} not null,
      channel_name ${t64} not null,
      event_type ${t64} not null,
      severity ${t64} not null,
      title ${t255} not null,
      summary ${t255} not null,
      created_at ${t64} not null
    )`)

  await createIndexIfMissing(
    db,
    'cogenta_channel_pending_lookup',
    pending,
    sql`(user_id, channel_name)`,
    false,
  )
}

async function createIndexIfMissing(
  db: DatabaseHandle,
  name: string,
  table: SqlFragment,
  columns: SqlFragment,
  unique: boolean,
): Promise<void> {
  const kind = unique ? unsafeRaw('unique index') : unsafeRaw('index')
  await db
    .query(sql`create ${kind} ${identifier(name, db.dialect)} on ${table} ${columns}`)
    .catch(() => undefined) // already there — no portable "if not exists" for indexes
}
