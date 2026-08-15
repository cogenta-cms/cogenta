import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const REGISTRY_TABLES = {
  skins: 'cogenta_skin_gallery',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * Owned by `@cogenta/plugins`, following `permissions/tables.ts`'s
 * `ensurePluginTables` pattern exactly: `create table if not exists`, run
 * once at startup, no separate migration file.
 *
 * A skin submission never executes code (contract D: a skin is a closed JSON
 * token set) — the "Skins" registry's only real gate is automatic validation
 * against `@cogenta/render`'s `validateSkin`, so there is no `reviewed_by`/
 * `reviewed_at` column the way a code-executing registry (plugins, themes)
 * would need: `status` is written once, at submission time, by the gate
 * itself, never by a human afterward.
 */
export async function ensureRegistryTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const skins = identifier(REGISTRY_TABLES.skins, d)
  const t255 = textColumn(d, 255)
  const tLong = unsafeRaw(d === 'sqlite' ? 'text' : 'text')

  await db.query(sql`
    create table if not exists ${skins} (
      id ${t255} not null primary key,
      submitter_id ${t255} not null,
      display_name ${t255} not null,
      description ${tLong},
      tokens_json ${tLong} not null,
      status ${t255} not null,
      rejection_code ${t255},
      rejection_reason ${tLong},
      submitted_at ${t255} not null
    )`)

  await createIndexIfMissing(db, 'cogenta_skin_gallery_status', skins, sql`(status, submitted_at)`)
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
