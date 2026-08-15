import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const FLEET_TABLES = {
  pairingTokens: 'cogenta_fleet_pairing_tokens',
  sites: 'cogenta_fleet_sites',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
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
 * Owned by `@cogenta/fleet`, `create table if not exists` pattern exactly as
 * `@cogenta/plugins`'s `ensurePluginTables`/`@cogenta/channels`'s
 * `ensureChannelTables` — no separate migration file.
 *
 * `pairing_tokens` holds only the token's SHA-256 hash — never the token
 * itself, same discipline as `@cogenta/auth`'s session tokens and
 * `@cogenta/channels`'s linking codes; a leaked table hands out nothing
 * usable. `sites` is the real, persistent registration a consumed token
 * produces — the control plane's own record of "this public key is site X",
 * which every later task (télémétrie, commandes signées) authenticates
 * against.
 */
export async function ensureFleetTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const t255 = textColumn(d, 255)
  const t1024 = textColumn(d, 1024)

  const tokens = identifier(FLEET_TABLES.pairingTokens, d)
  await db.query(sql`
    create table if not exists ${tokens} (
      id ${t255} not null primary key,
      token_hash ${t255} not null,
      site_name ${t255} not null,
      expires_at ${t255} not null,
      consumed_at ${t255},
      site_id ${t255}
    )`)
  await createIndexIfMissing(db, 'cogenta_fleet_pairing_tokens_hash', tokens, sql`(token_hash)`)

  const sites = identifier(FLEET_TABLES.sites, d)
  await db.query(sql`
    create table if not exists ${sites} (
      id ${t255} not null primary key,
      name ${t255} not null,
      public_key ${t1024} not null,
      registered_at ${t255} not null,
      revoked_at ${t255}
    )`)
}
