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
import { entriesTable, indexName } from './naming.js'

/**
 * The `schema@2.0 → 2.1` migration (ADR-0027).
 *
 * Adds the editorial workflow's two columns to every collection's entry
 * table — `review_state` (`schema@2.1`'s `reviewState`, orthogonal to
 * `status` exactly as `deleted_at` is) and `assigned_reviewer`. Both are
 * additive and reversible:
 *
 * - `review_state` is `not null default 'none'`, so every existing row reads
 *   `'none'` the instant the column exists — a client that reads `status`
 *   and ignores everything else gets exactly the values it always did.
 * - `assigned_reviewer` is nullable, defaulting to unassigned.
 *
 * **Not marked `destructive`.** Unlike `schema@1.0 → 2.0`, whose rollback
 * discarded the trash and every classification, rolling this one back only
 * drops two columns nothing yet depends on the day it ships — there is no
 * site in production, so no real workflow state exists to lose. A future
 * migration that adds this to a live site with real review history should
 * reconsider that if the down path would then discard something real.
 */

export interface Schema21MigrationOptions {
  readonly collections: readonly CollectionDefinition[]
  /** Overridable so a site can slot this into its own numbering. */
  readonly id?: string
}

const DEFAULT_ID = '0003_schema_2_1_editorial_workflow'

function addReviewState(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  return sql`alter table ${table}
             add column ${identifier('review_state', dialect)} ${textColumn(dialect, 24)}
             not null default ${unsafeRaw("'none'")}`
}

function addAssignedReviewer(
  collection: CollectionDefinition,
  dialect: DatabaseDialect,
): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  return sql`alter table ${table}
             add column ${identifier('assigned_reviewer', dialect)} ${textColumn(dialect, 64)}`
}

function dropReviewState(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  return sql`alter table ${table} drop column ${identifier('review_state', dialect)}`
}

function dropAssignedReviewer(
  collection: CollectionDefinition,
  dialect: DatabaseDialect,
): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  return sql`alter table ${table} drop column ${identifier('assigned_reviewer', dialect)}`
}

function reviewIndex(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const name = entriesTable(collection.name)
  return sql`create index ${identifier(indexName(name, 'review'), dialect)}
             on ${identifier(name, dialect)}
             (${identifier('review_state', dialect)}, ${identifier('assigned_reviewer', dialect)})`
}

/** MySQL needs the table named to drop an index; SQLite (and Postgres) name it directly. */
function dropReviewIndexOnTable(
  collection: CollectionDefinition,
  dialect: DatabaseDialect,
): SqlFragment {
  return sql`drop index ${identifier(indexName(entriesTable(collection.name), 'review'), dialect)}
             on ${identifier(entriesTable(collection.name), dialect)}`
}

function dropReviewIndexStandalone(
  collection: CollectionDefinition,
  dialect: DatabaseDialect,
): SqlFragment {
  return sql`drop index ${identifier(indexName(entriesTable(collection.name), 'review'), dialect)}`
}

export function schema21Migration(options: Schema21MigrationOptions): Migration {
  const { collections } = options

  return {
    id: options.id ?? DEFAULT_ID,
    name: 'schema@2.1 — editorial workflow and owner permission',
    destructive: false,
    impact:
      "Adds review_state (not null, default 'none') and a nullable assigned_reviewer column " +
      'to every collection. Moves no existing row and changes no existing value: a client ' +
      'that reads status and ignores the rest sees exactly what it always did. The rollback ' +
      'drops both columns, which is safe today because no site in production carries real ' +
      'review history yet.',
    estimatedDurationMs: 300 * Math.max(1, collections.length),

    up: async (tx: SqlExecutor): Promise<void> => {
      const dialect = tx.dialect

      for (const collection of collections) {
        await tx.query(addReviewState(collection, dialect))
        await tx.query(addAssignedReviewer(collection, dialect))
        // `create index` has no portable `if not exists`; a failure here means
        // it is already there, which is the state we wanted anyway.
        await tx.query(reviewIndex(collection, dialect)).catch(() => undefined)
      }
    },

    down: async (tx: SqlExecutor): Promise<void> => {
      const dialect = tx.dialect

      for (const collection of [...collections].reverse()) {
        const drop = dialect === 'mysql' ? dropReviewIndexOnTable : dropReviewIndexStandalone
        await tx.query(drop(collection, dialect)).catch(() => undefined)
        await tx.query(dropAssignedReviewer(collection, dialect))
        await tx.query(dropReviewState(collection, dialect))
      }
    },
  }
}
