import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const PERMISSION_TABLES = {
  grants: 'cogenta_plugin_grants',
  disabled: 'cogenta_plugin_disabled',
  usage: 'cogenta_plugin_usage',
  provisions: 'cogenta_plugin_provisions',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * Owned by `@cogenta/plugins`, following `@cogenta/channels`'s
 * `ensureChannelTables` pattern exactly (itself following `@cogenta/auth`'s
 * `ensureAuthTables`): `create table if not exists`, run once at startup, no
 * separate migration file.
 *
 * A grant is keyed to the EXACT capability string (`http.fetch:api.exemple.com`,
 * not just the bare name `http.fetch`) — task 1's grammar already makes the
 * parameter part of the capability's identity, so a grant never implicitly
 * covers a different parameter of the same bare name.
 */
export async function ensurePluginTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const grants = identifier(PERMISSION_TABLES.grants, d)
  const t255 = textColumn(d, 255)
  const t512 = textColumn(d, 512)

  await db.query(sql`
    create table if not exists ${grants} (
      id ${t255} not null primary key,
      plugin_name ${t255} not null,
      capability ${t512} not null,
      granted_at ${t255} not null,
      revoked_at ${t255}
    )`)

  await createIndexIfMissing(
    db,
    'cogenta_plugin_grants_lookup',
    grants,
    sql`(plugin_name, capability)`,
  )

  const disabled = identifier(PERMISSION_TABLES.disabled, d)
  await db.query(sql`
    create table if not exists ${disabled} (
      plugin_name ${t255} not null primary key,
      reason ${t255} not null,
      details ${t512},
      disabled_at ${t255} not null
    )`)

  // Fiche 29 task 3 — one accumulated row per plugin (`../permissions/usage.js`).
  await ensurePluginProvisionTable(db)

  const usage = identifier(PERMISSION_TABLES.usage, d)
  const tInt = unsafeRaw(d === 'sqlite' ? 'integer' : 'bigint')
  await db.query(sql`
    create table if not exists ${usage} (
      plugin_name ${t255} not null primary key,
      call_count ${tInt} not null,
      total_duration_ms ${tInt} not null,
      error_count ${tInt} not null,
      timeout_count ${tInt} not null,
      memory_count ${tInt} not null,
      crash_count ${tInt} not null,
      last_run_at ${t255} not null,
      last_duration_ms ${tInt} not null,
      last_outcome ${t255} not null,
      last_error ${t512}
    )`)
}

/**
 * What a plugin adds to this site's block and widget vocabularies, remembered
 * so that **removing the plugin degrades a page instead of emptying it**
 * (L32).
 *
 * Without this row the promise would be empty: the stored entry keeps the
 * block's data, but nothing would know what the block was, what to fall back
 * on, or where the fallback's fields take their values from — so the block
 * would silently disappear from the page along with the words someone wrote
 * in it. Verified by a test that installs a plugin, removes it, and asks for
 * the page.
 *
 * In the database rather than on disk because a site can run as several
 * replicas sharing one database and no filesystem, exactly like every other
 * fact about a plugin this package stores.
 */
export async function ensurePluginProvisionTable(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const table = identifier(PERMISSION_TABLES.provisions, d)
  const t255 = textColumn(d, 255)
  await db.query(sql`
    create table if not exists ${table} (
      kind ${t255} not null,
      name ${t255} not null,
      plugin_name ${t255} not null,
      declaration text not null,
      recorded_at ${t255} not null,
      primary key (kind, name)
    )`)
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
