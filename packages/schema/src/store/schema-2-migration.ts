import {
  type DatabaseDialect,
  identifier,
  type Migration,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import type { CollectionDefinition, TaxonomyDefinition } from '../types.js'
import { integerColumn, jsonColumn, textColumn, timestampColumn, uuidColumn } from './columns.js'
import { entriesTable, indexName, relationTable, taxonomyTable } from './naming.js'
import { relationsOf } from './tables.js'
import { TAXONOMY_PATH_LENGTH } from './taxonomy-path.js'

/**
 * The `schema@1.0 → 2.0` migration (ADR-0022).
 *
 * It does three things, and each is reversible:
 *
 * 1. adds `deleted_at` to every collection's entry table — the trash;
 * 2. creates one terms table per declared taxonomy;
 * 3. creates the join table of every `f.taxonomy({ many: true })` field.
 *
 * **The `down` is a real data loss and says so.** Dropping `deleted_at`
 * discards the trash: every entry sitting in it becomes live again with no
 * record that it was ever thrown away, and dropping the terms tables discards
 * the whole classification. The migration is therefore marked `destructive`,
 * which makes the migrator demand an explicit confirmation *and* a verified
 * backup before it will run in either direction. Marking only the rollback is
 * not something `Migration` can express, and erring towards asking is the
 * right way round for a flag whose whole job is to make someone stop.
 *
 * The project has no site in production today, so this moves no real data —
 * it is written and tested as if it did, because the day it does is not the
 * day to start.
 */

export interface Schema2MigrationOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies?: readonly TaxonomyDefinition[]
  /** Overridable so a site can slot this into its own numbering. */
  readonly id?: string
}

const DEFAULT_ID = '0002_schema_2_trash_and_taxonomies'

/**
 * `add column` and `drop column` exist on all three dialects — but SQLite only
 * learnt `drop column` in 3.35 (2021) and refuses it on a column an index
 * touches, which is why the index is dropped first on the way down.
 */
function addDeletedAt(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  return sql`alter table ${table}
             add column ${identifier('deleted_at', dialect)} ${timestampColumn(dialect)}`
}

function dropDeletedAt(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  return sql`alter table ${table} drop column ${identifier('deleted_at', dialect)}`
}

function trashIndex(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const name = entriesTable(collection.name)
  return sql`create index ${identifier(indexName(name, 'trash'), dialect)}
             on ${identifier(name, dialect)} (${identifier('deleted_at', dialect)})`
}

function dropTrashIndex(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  // MySQL has no `drop index if exists` before 8.0.x either, so the caller
  // swallows the failure: the only realistic cause is that it is already gone.
  return sql`drop index ${identifier(indexName(entriesTable(collection.name), 'trash'), dialect)}
             on ${identifier(entriesTable(collection.name), dialect)}`
}

function dropIndexStandalone(
  collection: CollectionDefinition,
  dialect: DatabaseDialect,
): SqlFragment {
  return sql`drop index ${identifier(indexName(entriesTable(collection.name), 'trash'), dialect)}`
}

function termsTable(taxonomy: TaxonomyDefinition, dialect: DatabaseDialect): SqlFragment {
  const table = identifier(taxonomyTable(taxonomy.name), dialect)

  return sql`create table if not exists ${table} (
    ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
    ${identifier('parent_id', dialect)} ${uuidColumn(dialect)},
    ${identifier('slug', dialect)} ${textColumn(dialect, 255)} not null,
    ${identifier('labels', dialect)} ${jsonColumn()} not null,
    ${identifier('position', dialect)} ${integerColumn()} not null,
    ${identifier('path', dialect)} ${textColumn(dialect, TAXONOMY_PATH_LENGTH)} not null,
    ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
    ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
    constraint ${identifier(indexName(taxonomyTable(taxonomy.name), 'parent_fk'), dialect)}
      foreign key (${identifier('parent_id', dialect)})
      references ${table} (${identifier('id', dialect)}) on delete cascade
  )`
}

function termsIndexes(taxonomy: TaxonomyDefinition, dialect: DatabaseDialect): SqlFragment[] {
  const name = taxonomyTable(taxonomy.name)
  const table = identifier(name, dialect)

  return [
    sql`create unique index ${identifier(indexName(name, 'slug_unique'), dialect)}
        on ${table} (${identifier('slug', dialect)})`,
    sql`create index ${identifier(indexName(name, 'path'), dialect)}
        on ${table} (${identifier('path', dialect)})`,
    sql`create index ${identifier(indexName(name, 'parent'), dialect)}
        on ${table} (${identifier('parent_id', dialect)}, ${identifier('position', dialect)})`,
  ]
}

function taxonomyJoinTable(
  collection: CollectionDefinition,
  field: string,
  taxonomy: string,
  dialect: DatabaseDialect,
): SqlFragment {
  const name = relationTable(collection.name, field)
  const table = identifier(name, dialect)

  return sql`create table if not exists ${table} (
    ${identifier('entry_id', dialect)} ${uuidColumn(dialect)} not null,
    ${identifier('target_id', dialect)} ${uuidColumn(dialect)} not null,
    ${identifier('position', dialect)} ${integerColumn()} not null,
    primary key (${identifier('entry_id', dialect)}, ${identifier('target_id', dialect)}),
    constraint ${identifier(indexName(name, 'entry_fk'), dialect)}
      foreign key (${identifier('entry_id', dialect)})
      references ${identifier(entriesTable(collection.name), dialect)} (${identifier('id', dialect)})
      on delete cascade,
    constraint ${identifier(indexName(name, 'target_fk'), dialect)}
      foreign key (${identifier('target_id', dialect)})
      references ${identifier(taxonomyTable(taxonomy), dialect)} (${identifier('id', dialect)})
      on delete cascade
  )`
}

/** The `many: true` taxonomy fields of a collection, with their taxonomy. */
function taxonomyJoins(
  collection: CollectionDefinition,
): { readonly field: string; readonly taxonomy: string }[] {
  return relationsOf(collection)
    .filter((relation) => relation.kind === 'taxonomy' && relation.many)
    .map((relation) => ({ field: relation.field, taxonomy: relation.to }))
}

export function schema2Migration(options: Schema2MigrationOptions): Migration {
  const { collections } = options
  const taxonomies = options.taxonomies ?? []

  return {
    id: options.id ?? DEFAULT_ID,
    name: 'schema@2.0 — trash and taxonomies',
    destructive: true,
    impact:
      'Adds a nullable deleted_at column to every collection and creates the taxonomy tables. ' +
      'Moves no existing row. The rollback drops deleted_at and the taxonomy tables, which ' +
      'permanently discards everything in the trash and every classification: entries sitting ' +
      'in the trash silently become live again, with no record that they were ever deleted.',
    estimatedDurationMs: 500 * Math.max(1, collections.length + taxonomies.length),

    up: async (tx: SqlExecutor): Promise<void> => {
      const dialect = tx.dialect

      // Terms first: a join table below carries a real foreign key into them.
      for (const taxonomy of taxonomies) {
        await tx.query(termsTable(taxonomy, dialect))
        for (const statement of termsIndexes(taxonomy, dialect)) {
          await tx.query(statement).catch(() => undefined)
        }
      }

      for (const collection of collections) {
        await tx.query(addDeletedAt(collection, dialect))
        // `create index` has no portable `if not exists`; a failure here means
        // it is already there, which is the state we wanted anyway.
        await tx.query(trashIndex(collection, dialect)).catch(() => undefined)

        for (const join of taxonomyJoins(collection)) {
          await tx.query(taxonomyJoinTable(collection, join.field, join.taxonomy, dialect))
        }
      }
    },

    down: async (tx: SqlExecutor): Promise<void> => {
      const dialect = tx.dialect

      for (const collection of [...collections].reverse()) {
        for (const join of taxonomyJoins(collection)) {
          await tx.query(
            sql`drop table if exists ${identifier(relationTable(collection.name, join.field), dialect)}`,
          )
        }

        // SQLite refuses to drop a column an index still covers, and the two
        // dialects spell "drop index" differently — MySQL needs the table.
        const drop = dialect === 'mysql' ? dropTrashIndex : dropIndexStandalone
        await tx.query(drop(collection, dialect)).catch(() => undefined)
        await tx.query(dropDeletedAt(collection, dialect))
      }

      for (const taxonomy of [...taxonomies].reverse()) {
        await tx.query(
          sql`drop table if exists ${identifier(taxonomyTable(taxonomy.name), dialect)}`,
        )
      }
    },
  }
}
