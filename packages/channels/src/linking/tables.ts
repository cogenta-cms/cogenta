import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const LINKING_TABLES = {
  linkCodes: 'cogenta_channel_link_codes',
  links: 'cogenta_channel_links',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * Owned by `@cogenta/channels`, following `@cogenta/auth`'s `ensureAuthTables`
 * pattern exactly: `create table if not exists`, run once at startup, so a
 * fresh install and an upgrade take the same path — no separate migration
 * file, same as `cogenta_sessions`/`cogenta_users` are not migration-file-backed
 * either.
 */
export async function ensureChannelTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const linkCodes = identifier(LINKING_TABLES.linkCodes, d)
  const links = identifier(LINKING_TABLES.links, d)
  const t64 = textColumn(d, 64)
  const t255 = textColumn(d, 255)
  const t512 = textColumn(d, 512)

  await db.query(sql`
    create table if not exists ${linkCodes} (
      id ${t64} not null primary key,
      -- Hashed, never stored plain — same reasoning as a session token
      -- (@cogenta/auth): a leaked table hands out nothing usable.
      code_hash ${t512} not null unique,
      channel_name ${t64} not null,
      user_id ${t64} not null,
      created_at ${t64} not null,
      expires_at ${t64} not null,
      used_at ${t64}
    )`)

  await db.query(sql`
    create table if not exists ${links} (
      id ${t64} not null primary key,
      channel_name ${t64} not null,
      channel_user_id ${t255} not null,
      user_id ${t64} not null,
      linked_at ${t64} not null,
      revoked_at ${t64}
    )`)

  await createIndexIfMissing(
    db,
    'cogenta_channel_links_lookup',
    links,
    sql`(channel_name, channel_user_id)`,
  )
  await createIndexIfMissing(db, 'cogenta_channel_links_user', links, sql`(user_id)`)
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
