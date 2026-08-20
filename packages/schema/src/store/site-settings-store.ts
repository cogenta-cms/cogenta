import { CogentaError, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { siteSettingByKey } from './site-settings-registry.js'
import { SITE_SETTINGS_SITE_SCOPE, SITE_SETTINGS_TABLE } from './site-settings-tables.js'

/**
 * The persistence layer of `SITE_SETTINGS_REGISTRY` (fiche 23 task 1).
 *
 * A row exists only once someone has actually written a value — a registry
 * entry nobody has touched yet has no row at all, and the caller (the REST
 * router) is the one that fills in `defaultValue` for it. That is
 * deliberate: it is what lets a new registry entry with a new default ship
 * without a migration that back-fills every existing site's table.
 */

export interface SiteSettingRecord {
  readonly key: string
  /** `SITE_SETTINGS_SITE_SCOPE` (`''`) for a site-scoped setting, a real locale code for a locale-scoped one. */
  readonly locale: string
  readonly value: unknown
  readonly updatedAt: string
  /** The actor who wrote this value, or `null` for a value seeded outside a request (a migration, a test fixture). */
  readonly updatedBy: string | null
}

export interface SiteSettingsStoreOptions {
  readonly db: DatabaseHandle
  readonly now?: () => Date
}

export interface SiteSettingsStore {
  /**
   * Every row written for this locale, plus every site-scoped row — exactly
   * the set of overrides that apply when rendering settings for this locale
   * context. A registry entry with no row here is unset; the caller applies
   * its default.
   */
  list(locale: string): Promise<readonly SiteSettingRecord[]>
  get(key: string, locale: string): Promise<SiteSettingRecord | null>
  /**
   * Refuses a key the registry does not declare (`SITE_SETTING_UNKNOWN`), a
   * value that fails that key's own schema, or a `locale` that does not
   * match the key's declared scope (`SITE_SETTING_INVALID` for both — the
   * registry is the single place either failure is decided).
   */
  set(
    key: string,
    locale: string,
    value: unknown,
    updatedBy: string | null,
  ): Promise<SiteSettingRecord>
}

type Row = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

function unknownSetting(key: string): CogentaError {
  return new CogentaError({
    code: 'SITE_SETTING_UNKNOWN',
    message: `"${key}" is not a declared site setting.`,
    hint: 'Site settings are a closed registry (fiche 23) — check the key against SITE_SETTINGS_REGISTRY, or declare it there first.',
    details: { key },
  })
}

function toRecord(row: Row): SiteSettingRecord {
  return {
    key: text(row['key']),
    locale: text(row['locale']),
    value: JSON.parse(text(row['value'])) as unknown,
    updatedAt: text(row['updated_at']),
    updatedBy: nullableText(row['updated_by']),
  }
}

export function createSiteSettingsStore(options: SiteSettingsStoreOptions): SiteSettingsStore {
  const { db } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())

  const table = identifier(SITE_SETTINGS_TABLE, dialect)
  const keyColumn = identifier('key', dialect)
  const localeColumn = identifier('locale', dialect)
  const valueColumn = identifier('value', dialect)
  const updatedAtColumn = identifier('updated_at', dialect)
  const updatedByColumn = identifier('updated_by', dialect)

  return {
    list: async (locale) => {
      const found = await db.query<Row>(
        locale === SITE_SETTINGS_SITE_SCOPE
          ? sql`select * from ${table} where ${localeColumn} = ${SITE_SETTINGS_SITE_SCOPE}`
          : sql`select * from ${table} where ${localeColumn} in (${SITE_SETTINGS_SITE_SCOPE}, ${locale})`,
      )
      return found.rows.map(toRecord)
    },

    get: async (key, locale) => {
      const found = await db.query<Row>(
        sql`select * from ${table} where ${keyColumn} = ${key} and ${localeColumn} = ${locale}`,
      )
      const row = found.rows[0]
      return row === undefined ? null : toRecord(row)
    },

    set: async (key, locale, value, updatedBy) => {
      const definition = siteSettingByKey(key)
      if (definition === undefined) throw unknownSetting(key)

      const expectedLocale = definition.scope === 'site'
      if (expectedLocale && locale !== SITE_SETTINGS_SITE_SCOPE) {
        throw new CogentaError({
          code: 'SITE_SETTING_INVALID',
          message: `"${key}" is a site-wide setting; it cannot be written for a specific locale.`,
          hint: 'Omit the locale for this key.',
          details: { key, locale },
        })
      }
      if (!expectedLocale && locale === SITE_SETTINGS_SITE_SCOPE) {
        throw new CogentaError({
          code: 'SITE_SETTING_INVALID',
          message: `"${key}" is a per-locale setting; a locale is required.`,
          hint: 'Pass the locale this value applies to.',
          details: { key },
        })
      }

      const parsed = definition.schema.safeParse(value)
      if (!parsed.success) {
        throw new CogentaError({
          code: 'SITE_SETTING_INVALID',
          message: `"${key}" received a value that does not match its declared schema: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
          hint: "Check the value against this setting's type in the settings screen.",
          details: { key, issues: parsed.error.issues.map((issue) => issue.message) },
        })
      }

      const at = now().toISOString()
      const serialised = JSON.stringify(parsed.data)

      await db.transaction(
        async (tx) => {
          const existing = await tx.query<Row>(
            sql`select ${keyColumn} from ${table} where ${keyColumn} = ${key} and ${localeColumn} = ${locale}`,
          )
          if (existing.rows.length > 0) {
            await tx.query(
              sql`update ${table}
                  set ${valueColumn} = ${serialised}, ${updatedAtColumn} = ${at}, ${updatedByColumn} = ${updatedBy}
                  where ${keyColumn} = ${key} and ${localeColumn} = ${locale}`,
            )
          } else {
            await tx.query(
              sql`insert into ${table} (${keyColumn}, ${localeColumn}, ${valueColumn}, ${updatedAtColumn}, ${updatedByColumn})
                  values (${key}, ${locale}, ${serialised}, ${at}, ${updatedBy})`,
            )
          }
        },
        { immediate: true },
      )

      return { key, locale, value: parsed.data, updatedAt: at, updatedBy }
    },
  }
}
