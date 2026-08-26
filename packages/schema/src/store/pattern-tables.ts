import { type DatabaseHandle, identifier, type SqlFragment, sql } from '@cogenta/core'
import { jsonColumn, textColumn, timestampColumn, uuidColumn } from './columns.js'
import { indexName } from './naming.js'

/**
 * The page builder's motif/model library (fiche 43, sub-chantier A; fiche 05
 * task 1).
 *
 * A pattern is not schema-declared content — it is a reusable *shape*, an
 * editor's own composition saved from the builder — so it gets the same
 * one-fixed-table treatment as a menu (`menu-tables.ts`) rather than a table
 * per collection. `blocks` stores exactly the contract-B block list the
 * builder already sends to `POST /api/builder/render` (`key`/`type`/`data`),
 * never HTML or CSS (R3): inserting a pattern is indistinguishable from
 * placing the same blocks by hand.
 *
 * `kind` distinguishes a **motif** (a handful of blocks dropped into an
 * existing page, added to whatever is already there) from a **modèle de page
 * complet** (fiche 43 sub-chantier A's "second niveau" — replaces the whole
 * block zone, and only after the admin asks for explicit confirmation; that
 * confirmation is a UI concern, not something this table enforces). Both
 * shapes are "a list of blocks"; nothing about the stored row differs.
 */
export const PATTERN_TABLE = 'cogenta_patterns'

export const PATTERN_KINDS = ['pattern', 'template'] as const
export type PatternKind = (typeof PATTERN_KINDS)[number]

/** How long a pattern's `name` may be. */
export const PATTERN_NAME_LENGTH = 255
/** How long a pattern's `category` (an admin-only, free-form grouping label) may be. */
export const PATTERN_CATEGORY_LENGTH = 64

export async function ensurePatternTables(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const patterns = identifier(PATTERN_TABLE, dialect)

  await db.query(sql`create table if not exists ${patterns} (
    ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
    ${identifier('name', dialect)} ${textColumn(dialect, PATTERN_NAME_LENGTH)} not null,
    ${identifier('category', dialect)} ${textColumn(dialect, PATTERN_CATEGORY_LENGTH)},
    ${identifier('kind', dialect)} ${textColumn(dialect, 16)} not null,
    ${identifier('blocks', dialect)} ${jsonColumn()} not null,
    ${identifier('provenance', dialect)} ${textColumn(dialect, 16)} not null,
    ${identifier('provenance_detail', dialect)} ${jsonColumn()},
    ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
    ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null
  )`)

  const indexStatements: SqlFragment[] = [
    // Listing is always "every pattern of this kind, most recent first" — the
    // only query the picker and the library screen ever make.
    sql`create index ${identifier(indexName(PATTERN_TABLE, 'kind_created'), dialect)}
        on ${patterns} (${identifier('kind', dialect)}, ${identifier('created_at', dialect)})`,
  ]
  for (const statement of indexStatements) {
    await db.query(statement).catch(() => undefined)
  }
}
