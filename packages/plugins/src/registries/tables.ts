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
  skills: 'cogenta_skill_registry',
  themes: 'cogenta_theme_registry',
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
 *
 * A skill submission is the opposite case in the lot's own "## Registres"
 * table: "Revue de contenu", not automatic validation. `skill_name`/
 * `skill_version`/`reviewed_by`/`reviewed_at` exist here — absent from the
 * skins table above — because a skill's gate is a real two-step state
 * machine (automatic parse pre-check, then a human decision), not a single
 * automatic verdict.
 *
 * A theme submission (task 12) is automatic-only again, like skins — no
 * `reviewed_by`/`reviewed_at` — so its base columns end up identical to the
 * skins table's, minus `tokens_json` (a theme's real content lives on disk
 * at submission time, verified in place, not persisted as an inline blob).
 * With three real registries now built, this is the natural point to weigh a
 * shared `Registry<T>` helper (task 11 deferred that exact question here) —
 * the honest call: the three literal `create table` blocks below stay
 * because Zig-zagging column sets (skins/themes share a shape skills does
 * not; skills' own two-step state machine has no equivalent in the other
 * two) make a generic helper either leaky (an interface wide enough for all
 * three degenerates into passing raw column lists, which is what this
 * function already does) or a false abstraction over accidentally-similar
 * shapes. `identifier`/`sql`/`createIndexIfMissing` below already are the
 * real shared primitives; duplicating eight lines of column declarations
 * three times costs less than a parameterised table builder would.
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

  const skills = identifier(REGISTRY_TABLES.skills, d)
  await db.query(sql`
    create table if not exists ${skills} (
      id ${t255} not null primary key,
      submitter_id ${t255} not null,
      display_name ${t255} not null,
      description ${tLong},
      raw_content ${tLong} not null,
      skill_name ${t255},
      skill_version ${t255},
      status ${t255} not null,
      rejection_code ${t255},
      rejection_reason ${tLong},
      reviewed_by ${t255},
      reviewed_at ${t255},
      submitted_at ${t255} not null
    )`)

  await createIndexIfMissing(
    db,
    'cogenta_skill_registry_status',
    skills,
    sql`(status, submitted_at)`,
  )

  const themes = identifier(REGISTRY_TABLES.themes, d)
  await db.query(sql`
    create table if not exists ${themes} (
      id ${t255} not null primary key,
      submitter_id ${t255} not null,
      display_name ${t255} not null,
      description ${tLong},
      status ${t255} not null,
      rejection_code ${t255},
      rejection_reason ${tLong},
      submitted_at ${t255} not null
    )`)

  await createIndexIfMissing(
    db,
    'cogenta_theme_registry_status',
    themes,
    sql`(status, submitted_at)`,
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
