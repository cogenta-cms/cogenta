import { CogentaError } from '@cogenta/core'

/**
 * Physical names, derived from the schema in exactly one place.
 *
 * The rule is that nothing outside this file ever builds a table or column name
 * by concatenation: the migration generator, the store and the tests must agree
 * on the same string, and a second spelling of it is a silent data loss waiting
 * for the day someone renames a collection.
 */

const PREFIX = 'cogenta_'

/**
 * MySQL refuses an identifier longer than 64 characters, and truncating one
 * would make two collections collide on the same table. Failing at schema load
 * with a name in the message costs a rename; failing at migration time on the
 * one dialect nobody develops against costs a day.
 */
const MAX_IDENTIFIER_LENGTH = 64

function checked(name: string): string {
  if (name.length > MAX_IDENTIFIER_LENGTH) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `The generated SQL identifier "${name}" is ${name.length} characters long.`,
      hint: `MySQL allows at most ${MAX_IDENTIFIER_LENGTH}. Shorten the collection or field name.`,
      details: { name },
    })
  }
  return name
}

/** `publishedAt` becomes `published_at`. Digits stay attached to what precedes them. */
export function toSnakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

export function entriesTable(collection: string): string {
  return checked(`${PREFIX}${toSnakeCase(collection)}`)
}

/**
 * One row per block, never a JSON array in the content row (contract A).
 *
 * Three features depend on blocks being rows: answering "which pages use this
 * medium" for the media library, invalidating cache tags on publication, and
 * chunking content per block for RAG. None of them survive a JSON column.
 */
export function blocksTable(collection: string): string {
  return checked(`${entriesTable(collection)}_blocks`)
}

export function versionsTable(collection: string): string {
  return checked(`${entriesTable(collection)}_versions`)
}

/** The join table of a `many: true` relation. */
export function relationTable(collection: string, field: string): string {
  return checked(`${entriesTable(collection)}_${toSnakeCase(field)}`)
}

export function indexName(table: string, suffix: string): string {
  return checked(`${table}_${suffix}`)
}

export function columnFor(field: string): string {
  return checked(toSnakeCase(field))
}

/**
 * Columns the engine owns. A user field that lands on one of these is refused
 * rather than silently shadowed — `updated_at` written by an editor would break
 * every ordering and every cache decision in the product.
 */
export const SYSTEM_COLUMNS = [
  'id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'status',
  'locale',
  'translation_of',
  'version',
  'provenance',
  'provenance_detail',
] as const

export type SystemColumn = (typeof SYSTEM_COLUMNS)[number]

export function isSystemColumn(column: string): column is SystemColumn {
  return (SYSTEM_COLUMNS as readonly string[]).includes(column)
}
