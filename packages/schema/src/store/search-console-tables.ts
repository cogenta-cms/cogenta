import { type DatabaseHandle, identifier, sql, unsafeRaw } from '@cogenta/core'
import { textColumn, timestampColumn } from './columns.js'

/**
 * Google Search Console connector (fiche 70 task 4, ADR-0032) — same
 * one-fixed-table treatment as `menu-tables.ts`/`pattern-tables.ts`: this is
 * not schema-declared content, it is one site-wide connection record. At
 * most one row ever exists (`id` is always `'default'`), because a Cogenta
 * install is one site with one Search Console property, not a multi-tenant
 * registry.
 */
export const SEARCH_CONSOLE_CONNECTION_TABLE = 'cogenta_seo_search_console_connection'

/** The table's one and only possible row id. */
export const SEARCH_CONSOLE_CONNECTION_ID = 'default'

/** How long a GSC `siteUrl` (`https://example.com/` or `sc-domain:example.com`) may be. */
const SITE_URL_LENGTH = 255

export async function ensureSearchConsoleConnectionTable(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const table = identifier(SEARCH_CONSOLE_CONNECTION_TABLE, dialect)

  await db.query(sql`create table if not exists ${table} (
    ${identifier('id', dialect)} ${textColumn(dialect, 16)} not null primary key,
    ${identifier('site_url', dialect)} ${textColumn(dialect, SITE_URL_LENGTH)} not null,
    ${identifier('refresh_token_iv', dialect)} ${textColumn(dialect, 64)} not null,
    ${identifier('refresh_token_auth_tag', dialect)} ${textColumn(dialect, 64)} not null,
    ${identifier('refresh_token_ciphertext', dialect)} ${unsafeRaw('text')} not null,
    ${identifier('connected_at', dialect)} ${timestampColumn(dialect)} not null,
    ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null
  )`)
}
