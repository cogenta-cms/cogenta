import {
  type DatabaseDialect,
  identifier,
  type Migration,
  type SqlExecutor,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'
import type { CollectionDefinition } from '../types.js'
import { textColumn } from './columns.js'
import { entriesTable } from './naming.js'

/**
 * The `schema@2.1 → 2.3` migration (ADR-0037).
 *
 * Adds the two columns per-entry visibility needs:
 *
 * - `visibility`, `not null default 'public'`, so every existing row reads
 *   `'public'` the instant the column exists — nothing becomes private by
 *   being migrated, and a client that reads `status` and ignores the rest
 *   sees exactly the values it always did;
 * - `access_password`, nullable, holding the **hash** of the password a
 *   protected entry asks for. Never the password.
 *
 * Orthogonal to `status`, like `deleted_at` (ADR-0022) and `review_state`
 * (ADR-0027) before it: a private page is `published` *and* private.
 *
 * **Not marked `destructive`.** Rolling back drops two columns that carry a
 * restriction, not content: every entry becomes readable again — which is
 * exactly what a site running the previous version does anyway, since it has
 * no code that could enforce the restriction. A migration that removed a
 * *protection* from a live site would deserve the flag; this one removes the
 * ability to express one, on a project with no site in production.
 */

export interface Schema23MigrationOptions {
  readonly collections: readonly CollectionDefinition[]
  /** Overridable so a site can slot this into its own numbering. */
  readonly id?: string
}

// The id says `2_2` because the visibility contract was first labelled
// `schema@2.2` — a number fiche 42 had already taken for `strikethrough`/`hr`.
// The label is corrected to `schema@2.3`; the id is not, because it is what a
// database that already ran this migration recorded, and renaming it would run
// the migration a second time there.
const DEFAULT_ID = '0004_schema_2_2_entry_visibility'

function addVisibility(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  return sql`alter table ${table}
             add column ${identifier('visibility', dialect)} ${textColumn(dialect, 16)}
             not null default ${unsafeRaw("'public'")}`
}

function addAccessPassword(
  collection: CollectionDefinition,
  dialect: DatabaseDialect,
): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  return sql`alter table ${table}
             add column ${identifier('access_password', dialect)} ${textColumn(dialect, 255)}`
}

function dropColumn(
  collection: CollectionDefinition,
  dialect: DatabaseDialect,
  column: string,
): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  return sql`alter table ${table} drop column ${identifier(column, dialect)}`
}

export function schema23Migration(options: Schema23MigrationOptions): Migration {
  const { collections } = options

  return {
    id: options.id ?? DEFAULT_ID,
    name: 'schema@2.3 — per-entry visibility',
    destructive: false,
    impact:
      "Adds visibility (not null, default 'public') and a nullable access_password column to " +
      'every collection. Moves no existing row and changes no existing value: nothing becomes ' +
      'private by being migrated. The rollback drops both columns, which removes the ability to ' +
      'express a restriction rather than any content.',
    estimatedDurationMs: 300 * Math.max(1, collections.length),

    up: async (tx: SqlExecutor): Promise<void> => {
      for (const collection of collections) {
        await tx.query(addVisibility(collection, tx.dialect))
        await tx.query(addAccessPassword(collection, tx.dialect))
      }
    },

    down: async (tx: SqlExecutor): Promise<void> => {
      for (const collection of [...collections].reverse()) {
        await tx.query(dropColumn(collection, tx.dialect, 'access_password'))
        await tx.query(dropColumn(collection, tx.dialect, 'visibility'))
      }
    },
  }
}
