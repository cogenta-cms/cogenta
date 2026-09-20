import {
  CogentaError,
  type DatabaseDialect,
  identifier,
  type Migration,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import type { CollectionDefinition } from '../types.js'
import { onDeleteClause } from './columns.js'
import { columnFor, entriesTable, indexName, taxonomyTable } from './naming.js'
import { type ForeignKeyRewrite, rebuildSqliteTableForeignKeys } from './sqlite-table-rebuild.js'
import { relationsOf } from './tables.js'

/**
 * The `schema@2.4` repair: a single-valued taxonomy must never delete content.
 *
 * `f.taxonomy({ many: false })` stores its term in a **column of the entries
 * table**, and that column's foreign key was generated with `on delete
 * cascade`. Removing a term therefore deleted every entry that carried it —
 * permanently, and past the trash, because a row the database removes was never
 * soft-deleted: `deleted_at` is written by the application (ADR-0022), and the
 * application was never asked. `many: true` is the opposite case and keeps
 * `cascade` correctly: its term lives in a join table whose row *is* the
 * classification, so cascading removes the classification and leaves the entry.
 *
 * `tables.ts` now generates `set null` for the single-valued shape, but
 * `create table if not exists` does nothing to a table that already exists, so
 * every installed site keeps the constraint that loses data until this runs.
 *
 * ## The rollback puts `cascade` back, on purpose
 *
 * Restoring a destructive constraint looks indefensible until you ask what a
 * rollback is for: putting the database in the shape the code being rolled back
 * to expects. A `down` that quietly kept `set null` would make "reverted" a
 * lie, and would hide from an operator reading `cogenta migrate status` that
 * the schema no longer matches any released version. So it is faithful, and the
 * danger is stated rather than suffered — here, in `impact`, and by the
 * `destructive` flag, which makes the migrator demand an explicit confirmation
 * **and** a verified backup before it will move in *either* direction. Marking
 * only one direction is not something `Migration` can express (the same
 * reasoning `schema-2-migration.ts` wrote down), and for a flag whose entire
 * job is to make someone stop and read, erring towards asking is the right way
 * round. Going up, the confirmation is not ceremony either: on SQLite this
 * rebuilds tables, which is the one operation here that deserves a backup.
 *
 * ## Per dialect
 *
 * - **Postgres** — `drop constraint if exists`, then `add constraint`. Both are
 *   transactional, so the pair is atomic.
 * - **MySQL / MariaDB** — `drop foreign key`, then `add constraint`. Neither is
 *   transactional: DDL commits implicitly, so the pair is **not** atomic. The
 *   order is deliberate — an interruption between the two leaves the column
 *   with no foreign key at all, which is inert, never with `cascade` restored.
 *   The current rule is read from `information_schema` first, so a constraint
 *   that is already `SET NULL` is left untouched rather than dropped and
 *   re-added for nothing. `drop foreign key if exists` is not used: MySQL 8 has
 *   no such form, only MariaDB does.
 * - **SQLite** — no `alter table … drop constraint` exists at all, so the table
 *   is rebuilt. Doing that inside a migration is not the textbook procedure and
 *   the reasons are in `sqlite-table-rebuild.ts`: the manual's first step,
 *   `PRAGMA foreign_keys = OFF`, is a no-op inside the transaction the migrator
 *   opens, which makes `drop table` cascade into every `_versions`, `_blocks`
 *   and join table of the collection. Measured, not assumed.
 */

export interface Schema24MigrationOptions {
  readonly collections: readonly CollectionDefinition[]
  /** Overridable so a site can slot this into its own numbering. */
  readonly id?: string
}

const DEFAULT_ID = '0005_schema_2_4_taxonomy_set_null'

type DeleteRule = 'SET NULL' | 'CASCADE'

/** The `many: false` taxonomy fields of a collection — the only ones affected. */
function affectedColumns(collection: CollectionDefinition): { column: string; to: string }[] {
  return relationsOf(collection)
    .filter((relation) => relation.kind === 'taxonomy' && !relation.many)
    .map((relation) => ({ column: columnFor(relation.field), to: relation.to }))
}

function constraintName(collection: CollectionDefinition, column: string): string {
  return indexName(entriesTable(collection.name), `${column}_fk`)
}

function addConstraint(
  collection: CollectionDefinition,
  column: string,
  taxonomy: string,
  rule: DeleteRule,
  dialect: DatabaseDialect,
): SqlFragment {
  return sql`alter table ${identifier(entriesTable(collection.name), dialect)}
             add constraint ${identifier(constraintName(collection, column), dialect)}
             foreign key (${identifier(column, dialect)})
             references ${identifier(taxonomyTable(taxonomy), dialect)}
               (${identifier('id', dialect)})
             ${onDeleteClause(rule === 'SET NULL' ? 'setNull' : 'cascade')}`
}

/**
 * The delete rule MySQL currently records for a constraint, or null if it has
 * none.
 *
 * Read before writing rather than dropping-and-catching: a swallowed failure
 * hides a real one, and "the constraint was not there" is not the only reason
 * `drop foreign key` can fail.
 */
async function mysqlDeleteRule(
  tx: SqlExecutor,
  table: string,
  constraint: string,
): Promise<string | null> {
  const result = await tx.query<{ delete_rule: string }>(
    sql`select delete_rule from information_schema.referential_constraints
        where constraint_schema = database()
          and table_name = ${table}
          and constraint_name = ${constraint}`,
  )
  return result.rows[0]?.delete_rule ?? null
}

async function applyRule(
  tx: SqlExecutor,
  collections: readonly CollectionDefinition[],
  rule: DeleteRule,
): Promise<void> {
  const dialect = tx.dialect

  for (const collection of collections) {
    const columns = affectedColumns(collection)
    if (columns.length === 0) continue

    const table = entriesTable(collection.name)

    if (dialect === 'sqlite') {
      // One rebuild per table, not per column: the table is the unit.
      const rewrites: ForeignKeyRewrite[] = columns.map((entry) => ({
        column: entry.column,
        onDelete: rule,
      }))
      await rebuildSqliteTableForeignKeys(tx, table, rewrites)
      continue
    }

    for (const entry of columns) {
      const name = constraintName(collection, entry.column)

      if (dialect === 'postgres') {
        await tx.query(
          sql`alter table ${identifier(table, dialect)}
              drop constraint if exists ${identifier(name, dialect)}`,
        )
        await tx.query(addConstraint(collection, entry.column, entry.to, rule, dialect))
        continue
      }

      const current = await mysqlDeleteRule(tx, table, name)
      if (current === rule) continue
      if (current !== null) {
        await tx.query(
          sql`alter table ${identifier(table, dialect)}
              drop foreign key ${identifier(name, dialect)}`,
        )
      }
      await tx.query(addConstraint(collection, entry.column, entry.to, rule, dialect))
    }
  }
}

export function schema24Migration(options: Schema24MigrationOptions): Migration {
  const { collections } = options

  if (collections.length === 0) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: 'schema24Migration was given no collection to repair.',
      hint: 'Pass the collections of the site, the same set createSchemaTables receives.',
    })
  }

  return {
    id: options.id ?? DEFAULT_ID,
    name: 'schema@2.4 — a single-valued taxonomy un-classifies, it does not delete',
    // The rollback re-arms a foreign key that deletes entries, and on SQLite
    // the upgrade itself rebuilds tables. Both deserve the two flags.
    destructive: true,
    impact:
      'Replaces on delete cascade with on delete set null on the entry column of every ' +
      'f.taxonomy({ many: false }) field, so that deleting a term empties the column instead of ' +
      'deleting the entries that carried it. Changes no row value going up. On SQLite it ' +
      'rebuilds each affected entries table, copying every row and restoring every table that ' +
      'points at it. The rollback restores on delete cascade, which means deleting a term ' +
      'afterwards will again delete content permanently, bypassing the trash.',
    estimatedDurationMs: 800 * Math.max(1, collections.length),

    up: async (tx: SqlExecutor): Promise<void> => {
      await applyRule(tx, collections, 'SET NULL')
    },

    down: async (tx: SqlExecutor): Promise<void> => {
      await applyRule(tx, [...collections].reverse(), 'CASCADE')
    },
  }
}
