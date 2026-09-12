import { CogentaError, type DatabaseDialect, type SqlFragment, unsafeRaw } from '@cogenta/core'
import type { FieldDefinition, OnDelete } from '../types.js'

/**
 * The physical type of every field, per dialect.
 *
 * Two choices here are deliberate and worth stating, because both look wrong to
 * someone who knows only one database:
 *
 * 1. **Identifiers are `uuid` on Postgres, `char(36)` on MySQL, `text` on
 *    SQLite** (ADR-0015). The application mints the value, so nothing depends on
 *    `RETURNING` or on `insertId`.
 *
 * 2. **Timestamps and JSON are stored as text on every dialect.** A `timestamptz`
 *    comes back from `pg` as a `Date` while SQLite returns a string, and a
 *    `jsonb` comes back parsed while MySQL returns a string — so a column typed
 *    "natively" would make a row mean something different per dialect, which is
 *    exactly the leak the db layer exists to prevent. Contract A already
 *    declares `createdAt` as a string; ISO-8601 in UTC also sorts
 *    lexicographically, which is what keyset pagination needs.
 */

export function uuidColumn(dialect: DatabaseDialect): SqlFragment {
  if (dialect === 'postgres') return unsafeRaw('uuid')
  if (dialect === 'mysql') return unsafeRaw('char(36)')
  return unsafeRaw('text')
}

/** `varchar(n)` where it exists; SQLite has one string type and ignores the length. */
export function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

export function jsonColumn(): SqlFragment {
  // Text on every dialect, not `jsonb`/`json`: see the note above about drivers
  // parsing one and not the other. Nothing in L1 queries inside the document.
  return unsafeRaw('text')
}

export function timestampColumn(dialect: DatabaseDialect): SqlFragment {
  return textColumn(dialect, 32)
}

export function booleanColumn(dialect: DatabaseDialect): SqlFragment {
  if (dialect === 'postgres') return unsafeRaw('boolean')
  return unsafeRaw(dialect === 'mysql' ? 'tinyint' : 'integer')
}

/**
 * A boolean as the column built by `booleanColumn` will actually accept it.
 *
 * That column is `boolean` on Postgres and `tinyint`/`integer` elsewhere, so a
 * literal `'true'` — which is what several stores here used to bind — is a
 * string going into an integer column. SQLite is loose enough not to mind and
 * Postgres parses it, so only MySQL and MariaDB ever refused: "Incorrect
 * integer value: 'true' for column 'own' at row 1". The feature was simply
 * broken there, in production as much as in tests, until the integration
 * suite ran against a real MySQL for the first time.
 *
 * Kept next to `booleanColumn` on purpose: the two have to agree, and
 * splitting them is how they drifted in the first place.
 */
/**
 * Whether a string could be an id this schema ever minted.
 *
 * On Postgres an id column is a real `uuid`, and asking it about a value that
 * is not one is an *error* — `invalid input syntax for type uuid: "missing"` —
 * not an empty result. MySQL (`char(36)`) and SQLite (`text`) simply match
 * nothing. So a lookup by an id that came from a URL answers "not found" on
 * two engines and throws DB_UNREACHABLE, a 500, on the third.
 *
 * Every id here is a v4/v7 UUID minted by `newId()`, so a string that is not
 * shaped like one cannot name an existing row on any engine. Refusing it
 * before the query is what makes "not found" mean the same thing everywhere.
 */
export function isMintedId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
}

export function booleanValue(value: boolean, dialect: DatabaseDialect): boolean | number {
  return dialect === 'postgres' ? value : value ? 1 : 0
}

export function integerColumn(): SqlFragment {
  return unsafeRaw('integer')
}

/** Field kinds that get no column of their own on the entry table. */
export function isColumnless(field: FieldDefinition): boolean {
  if (field.kind === 'blocks') return true
  // A to-many relation lives in a join table, with a real foreign key on both
  // sides (contract A). Only a to-one relation is a column. A taxonomy field
  // works the same way, its join table pointing at the terms table instead.
  const joined = field.kind === 'relation' || field.kind === 'taxonomy'
  return joined && field.options['many'] === true
}

export function columnTypeFor(field: FieldDefinition, dialect: DatabaseDialect): SqlFragment {
  switch (field.kind) {
    case 'text': {
      const max = field.options['max']
      return typeof max === 'number' && max > 0 && max <= 65_535
        ? textColumn(dialect, max)
        : unsafeRaw('text')
    }
    case 'slug':
      return textColumn(dialect, 255)
    case 'select':
      // `many: true` holds several choices as an ordered JSON array (values.ts)
      // rather than a join table: a choice references nothing, so there is no
      // foreign key a join table would exist to enforce.
      return field.options['many'] === true ? jsonColumn() : textColumn(dialect, 255)
    case 'color':
      return textColumn(dialect, 32)
    case 'number':
      if (dialect === 'postgres') return unsafeRaw('double precision')
      return unsafeRaw(dialect === 'mysql' ? 'double' : 'real')
    case 'boolean':
      return booleanColumn(dialect)
    case 'date':
      return textColumn(dialect, 10)
    case 'datetime':
      return timestampColumn(dialect)
    case 'media':
      // No foreign key: the media library is its own subsystem and a content
      // table must not refuse to be created because it is not installed yet.
      // `many: true` follows `select`'s lead just above, for the same reason —
      // an ordered JSON array of ids, never a join table, since there is no
      // foreign key on either side to justify one.
      return field.options['many'] === true ? jsonColumn() : textColumn(dialect, 36)
    case 'relation':
    case 'taxonomy':
      return uuidColumn(dialect)
    case 'richText':
    case 'json':
    case 'geo':
      return jsonColumn()
    case 'blocks':
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: 'A blocks field has no column: each block is a row of its own.',
        hint: 'This is a bug in the caller — blocks are stored in the <collection>_blocks table.',
      })
    default:
      throw new CogentaError({
        code: 'CONFIG_INVALID',
        message: `Unknown field kind "${String(field.kind)}".`,
        hint: 'Field kinds are the closed set declared by contract A.',
        details: { kind: field.kind },
      })
  }
}

/** `restrict` is the default on purpose: deleting an author must not erase articles. */
export function onDeleteClause(onDelete: OnDelete | undefined): SqlFragment {
  const action = onDelete ?? 'restrict'
  if (action === 'cascade') return unsafeRaw('on delete cascade')
  if (action === 'setNull') return unsafeRaw('on delete set null')
  return unsafeRaw('on delete restrict')
}
