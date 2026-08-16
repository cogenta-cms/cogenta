import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'
import { ensureDailySaltTable } from './session-hash.js'

export const TABLES = {
  events: 'cogenta_analytics_events',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * Creates the events table (and the daily-salt table from `session-hash.ts`)
 * if they are not already there. Same idempotent, dialect-agnostic pattern as
 * `@cogenta/auth`'s `ensureAuthTables` — no formal up/down migration, because
 * nothing here is ever destructively altered after creation.
 */
export async function ensureAnalyticsTables(db: DatabaseHandle): Promise<void> {
  await ensureDailySaltTable(db)

  const d = db.dialect
  const events = identifier(TABLES.events, d)
  const t512 = textColumn(d, 512)
  const t64 = textColumn(d, 64)
  const t32 = textColumn(d, 32)

  await db.query(sql`
    create table if not exists ${events} (
      id ${t64} not null primary key,
      -- ISO-8601 text on every dialect, like every other timestamp column in
      -- this project (see the migrator's own table) — one representation, no
      -- risk of the three dialects disagreeing about time zones.
      at ${t64} not null,
      path ${t512} not null,
      -- Domain only, never a full URL. See referrer.ts for why.
      referrer_domain ${t512},
      device ${t32} not null,
      -- No IP address, no cookie, no persistent id: a daily-salted hash. See
      -- session-hash.ts — this is the privacy contract this table exists under.
      session_hash ${t64} not null
    )`)

  await createIndexIfMissing(db, 'cogenta_analytics_events_at', events, sql`(at)`)
  await createIndexIfMissing(db, 'cogenta_analytics_events_path', events, sql`(path, at)`)
  await createIndexIfMissing(
    db,
    'cogenta_analytics_events_session',
    events,
    sql`(session_hash, at)`,
  )
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
