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
      return textColumn(dialect, 255)
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
      return textColumn(dialect, 36)
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
