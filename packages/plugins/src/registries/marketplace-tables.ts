import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const MARKETPLACE_TABLES = {
  installs: 'cogenta_marketplace_installs',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * Owned by `@cogenta/plugins`, following `permissions/tables.ts`'s
 * `ensurePluginTables` pattern exactly. One row per marketplace catalog item
 * that has actually been installed — separate from the four submission
 * registries (`./tables.js`), which track "may this be listed" (a review
 * decision), never "is this active on this installation" (an install
 * decision). `item_id` is the catalog entry's own id, not the plugin name:
 * the catalog is the caller's concern (`createMarketplaceCatalog`), this
 * table only remembers what was installed from it.
 */
export async function ensureMarketplaceTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const installs = identifier(MARKETPLACE_TABLES.installs, d)
  const t255 = textColumn(d, 255)
  const tLong = unsafeRaw(d === 'sqlite' ? 'text' : 'text')

  await db.query(sql`
    create table if not exists ${installs} (
      item_id ${t255} not null primary key,
      kind ${t255} not null,
      display_name ${t255} not null,
      reference ${tLong} not null,
      plugin_name ${t255},
      plugin_version ${t255},
      signature_verified ${t255} not null,
      installed_by ${t255},
      installed_at ${t255} not null,
      updated_at ${t255} not null,
      enabled ${t255} not null default 'true'
    )`)

  // Fiche 29 task 1 — "activer/désactiver" as a real, separate column, not
  // a schema migration: `create table if not exists` never re-runs on an
  // existing table, so a pre-fiche-29 install row (created before this
  // column existed) needs it added explicitly, `default` applying only to
  // rows the `insert` itself creates. Every dialect here supports `add
  // column ... default` (SQLite since 3.35 for `default`-only columns,
  // Postgres and MySQL/MariaDB unconditionally) — same portable
  // best-effort idiom `createIndexIfMissing` already uses for "already
  // there, not an error".
  await db
    .query(sql`alter table ${installs} add column enabled ${t255} not null default 'true'`)
    .catch(() => undefined)
}
