import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { textColumn, timestampColumn, uuidColumn } from './columns.js'

/**
 * What a taxonomy term's public archive page shows (`/{taxonomy}/{slug}`).
 *
 * This is a **host-owned presentation setting, kept outside contract A**.
 * ADR-0022 fixes a term's fields (`id`, `parent`, `slug`, `position`,
 * `labels`) and `schema@2.x` is frozen, so the choice lives in its own fixed
 * table — the same one-fixed-table treatment as a pattern
 * (`pattern-tables.ts`) or a menu (`menu-tables.ts`) — and a term stays
 * exactly what the contract says it is. A term with no row here behaves as
 * `entries`; setting `entries` deletes the row rather than storing the default.
 *
 * The closed list below is what the REST route, the admin select and the
 * public renderer all read, so a mode exists in exactly one place.
 */
export const TERM_ARCHIVE_DISPLAY_TABLE = 'cogenta_term_archive_display'

/**
 * - `entries` — only the entries filed directly under the term (default)
 * - `subterms` — only the list of direct sub-terms
 * - `entries-and-subterms` — the term's own entries plus the sub-term list
 * - `subtree` — the term's entries and those of every descendant
 * - `subtree-and-subterms` — the subtree's entries plus the sub-term list
 */
export const TERM_ARCHIVE_DISPLAY_MODES = [
  'entries',
  'subterms',
  'entries-and-subterms',
  'subtree',
  'subtree-and-subterms',
] as const
export type TermArchiveDisplayMode = (typeof TERM_ARCHIVE_DISPLAY_MODES)[number]

/** What a term with no stored setting behaves as. */
export const DEFAULT_TERM_ARCHIVE_DISPLAY_MODE: TermArchiveDisplayMode = 'entries'

const TAXONOMY_LENGTH = 64
const MODE_LENGTH = 32

export async function ensureTermArchiveDisplayTable(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const table = identifier(TERM_ARCHIVE_DISPLAY_TABLE, dialect)
  await db.query(sql`create table if not exists ${table} (
    ${identifier('taxonomy', dialect)} ${textColumn(dialect, TAXONOMY_LENGTH)} not null,
    ${identifier('term_id', dialect)} ${uuidColumn(dialect)} not null,
    ${identifier('mode', dialect)} ${textColumn(dialect, MODE_LENGTH)} not null,
    ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
    primary key (${identifier('taxonomy', dialect)}, ${identifier('term_id', dialect)})
  )`)
}
