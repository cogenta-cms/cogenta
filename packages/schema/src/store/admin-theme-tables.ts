import { type DatabaseHandle, identifier, type SqlFragment, sql } from '@cogenta/core'
import { textColumn, timestampColumn } from './columns.js'

/**
 * The admin's own theme choice (L21 task 2) — one fixed table, exactly
 * `site-settings-tables.ts`'s pattern: this is runtime, admin-editable
 * state, not a schema-declared collection, so there is no per-name table to
 * mint and no versioned `cogenta migrate` entry either (the same reasoning
 * `menu-tables.ts` and `site-settings-tables.ts` already give for their own
 * fixed tables — reused here rather than a third explanation of the same
 * choice).
 *
 * Exactly one row ever exists, at the fixed id `SINGLETON_ID` — there is one
 * admin, not one per visitor, so "the current admin theme" is a singleton,
 * not a registry keyed by anything. `templateId` names one of
 * `ADMIN_THEME_TEMPLATES`; `overrides` is the serialised, curated
 * personalisation (`admin-theme-templates.ts`'s `AdminThemeOverrides`) layered
 * on top of it — never the templates themselves, which stay code, not data.
 */

export const ADMIN_THEME_TABLE = 'cogenta_admin_theme'

/** The one row this table ever holds. */
export const ADMIN_THEME_SINGLETON_ID = 'singleton'

/** Generous for a JSON object with at most seven short fields. */
export const ADMIN_THEME_OVERRIDES_LENGTH = 4000

export async function ensureAdminThemeTable(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const table = identifier(ADMIN_THEME_TABLE, dialect)
  const idColumn = identifier('id', dialect)

  const statements: SqlFragment[] = [
    sql`create table if not exists ${table} (
      ${idColumn} ${textColumn(dialect, 16)} not null primary key,
      ${identifier('template_id', dialect)} ${textColumn(dialect, 32)} not null,
      ${identifier('overrides', dialect)} ${textColumn(dialect, ADMIN_THEME_OVERRIDES_LENGTH)} not null,
      ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
      ${identifier('updated_by', dialect)} ${textColumn(dialect, 36)}
    )`,
  ]

  for (const statement of statements) {
    await db.query(statement)
  }
}
