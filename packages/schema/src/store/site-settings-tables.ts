import { type DatabaseHandle, identifier, type SqlFragment, sql } from '@cogenta/core'
import { textColumn, timestampColumn } from './columns.js'

/**
 * Editorial site settings (fiche 23) — the third category ADR-0025 names
 * between "infrastructure" (`cogenta.config.mjs`, read-only in the admin) and
 * "personal preference" (`localStorage`, never on the server at all): a
 * tagline, a homepage, a timezone — the things a rédacteur needs to change
 * without a terminal, and that must not create a second source of truth for
 * anything already in the config file (ADR-0025's whole point).
 *
 * One fixed table, exactly like `menu-tables.ts`: a site setting is not
 * schema-declared the way a collection or a taxonomy is, so there is no
 * per-name table to mint. `key` is the registry's own machine name
 * (`site-settings-registry.ts`); a key outside that registry is refused by
 * the store, never written here as a loose row.
 *
 * `locale` is part of the primary key and is never nullable: a site-scoped
 * setting is stored at the empty string, the same "no locale" sentinel this
 * column already treats as never colliding with a real one, so a plain
 * equality lookup — `key = ? and locale = ?` — is the whole read path for
 * both scopes, with no `is null` branch to keep in sync with `create` or
 * `update`.
 */

export const SITE_SETTINGS_TABLE = 'cogenta_site_settings'

/** The sentinel `locale` value for a site-scoped setting (never a real locale code). */
export const SITE_SETTINGS_SITE_SCOPE = ''

/** Long enough for any JSON value this fiche's registry stores (free text included). */
export const SITE_SETTING_VALUE_LENGTH = 8000

export async function ensureSiteSettingsTables(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const table = identifier(SITE_SETTINGS_TABLE, dialect)
  const keyColumn = identifier('key', dialect)
  const localeColumn = identifier('locale', dialect)

  const statements: SqlFragment[] = [
    sql`create table if not exists ${table} (
      ${keyColumn} ${textColumn(dialect, 128)} not null,
      ${localeColumn} ${textColumn(dialect, 16)} not null,
      ${identifier('value', dialect)} ${textColumn(dialect, SITE_SETTING_VALUE_LENGTH)} not null,
      ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
      ${identifier('updated_by', dialect)} ${textColumn(dialect, 36)},
      primary key (${keyColumn}, ${localeColumn})
    )`,
  ]

  for (const statement of statements) {
    await db.query(statement)
  }
}
