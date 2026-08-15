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
