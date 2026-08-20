import {
  CogentaError,
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import type {
  CollectionDefinition,
  FieldDefinition,
  OnDelete,
  TaxonomyDefinition,
} from '../types.js'
import {
  columnTypeFor,
  integerColumn,
  isColumnless,
  jsonColumn,
  onDeleteClause,
  textColumn,
  timestampColumn,
  uuidColumn,
} from './columns.js'
import { joinFragments } from './fragments.js'
import {
  blocksTable,
  columnFor,
  entriesTable,
  indexName,
  isSystemColumn,
  relationTable,
  taxonomyTable,
  versionsTable,
} from './naming.js'
import { TAXONOMY_PATH_LENGTH } from './taxonomy-path.js'

/**
 * The physical shape of a collection.
 *
 * This is the schema the migration generator (L1, task 3) will emit; the store
 * and the tests use it directly so that both are proven against the same DDL
 * rather than against two descriptions that drift.
 *
 * Three tables per collection, plus one per to-many relation:
 *
 * - `<t>` — one row per entry **per locale** (ADR-0014). It holds the live
 *   state: what the public renderer reads.
 * - `<t>_versions` — one row per version, holding a snapshot of the field
 *   values. The working draft of a published entry is the newest of these.
 * - `<t>_blocks` — one row per block, per version, ordered, with its `_key`.
 * - `<t>_<field>` — the join table of a `many: true` relation.
 */

export interface RelationTarget {
  readonly field: string
  readonly to: string
  readonly onDelete: OnDelete
  readonly many: boolean
  /**
   * What `to` names: another collection, or a taxonomy (`schema@2.0`).
   *
   * The two are stored the same way — a column for the to-one case, a join
   * table for the to-many one — but they point at different tables, and a
   * taxonomy is not content.
   */
  readonly kind: 'relation' | 'taxonomy'
}

export function relationsOf(collection: CollectionDefinition): RelationTarget[] {
  const relations: RelationTarget[] = []

  for (const [name, field] of Object.entries(collection.fields)) {
    if (field.kind === 'taxonomy') {
      const of = field.options['of']
      if (typeof of !== 'string' || of.length === 0) {
        throw new CogentaError({
          code: 'CONFIG_INVALID',
          message: `The taxonomy field "${name}" of "${collection.name}" names no taxonomy.`,
          hint: "Give it one: f.taxonomy({ of: 'category' }).",
          details: { collection: collection.name, field: name },
        })
      }
      // Removing a term un-classifies the content that carried it; it never
      // deletes that content, and it never refuses the removal either. A
      // classification is an opinion about an entry, not part of it.
      relations.push({
        field: name,
        to: of,
        onDelete: 'cascade',
        many: field.options['many'] !== false,
        kind: 'taxonomy',
      })
      continue
    }

    if (field.kind !== 'relation') continue

    const to = field.options['to']
    if (typeof to !== 'string' || to.length === 0) {
      throw new CogentaError({
        code: 'CONFIG_INVALID',
        message: `The relation field "${name}" of "${collection.name}" has no target collection.`,
        hint: "Give it a target: f.relation({ to: 'author' }).",
        details: { collection: collection.name, field: name },
      })
    }

    const many = field.options['many'] === true
    const onDelete = (field.options['onDelete'] as OnDelete | undefined) ?? 'restrict'

    if (many && onDelete === 'setNull') {
      throw new CogentaError({
        code: 'CONFIG_INVALID',
        message: `The relation "${name}" of "${collection.name}" is to-many, so onDelete: 'setNull' has no meaning.`,
        hint: "A join row has nothing to null out. Use 'restrict' or 'cascade'.",
        details: { collection: collection.name, field: name },
      })
    }

    relations.push({ field: name, to, onDelete, many, kind: 'relation' })
  }

  return relations
}

/** The table a relation target points at: entries, or taxonomy terms. */
function targetTable(relation: RelationTarget, dialect: DatabaseDialect): SqlFragment {
  return identifier(
    relation.kind === 'taxonomy' ? taxonomyTable(relation.to) : entriesTable(relation.to),
    dialect,
  )
}

/** Rejects a schema whose fields would collide with the engine's own columns. */
export function assertUsableFields(collection: CollectionDefinition): void {
  for (const name of Object.keys(collection.fields)) {
    const column = columnFor(name)
    if (!isSystemColumn(column)) continue

    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `"${name}" is a system field and cannot be declared on "${collection.name}".`,
      hint: 'id, createdAt, updatedAt, createdBy, updatedBy, status, locale, translationOf, version and provenance are maintained by the engine.',
      details: { collection: collection.name, field: name },
    })
  }
}

/**
 * Every field column is nullable, `required` included.
 *
 * `required` is a content rule, checked on write. A NOT NULL column would make
 * it impossible to save an incomplete draft — which is the normal state of a
 * piece being written — and would turn an editorial rule into a migration.
 */
function fieldColumn(name: string, field: FieldDefinition, dialect: DatabaseDialect): SqlFragment {
  return sql`${identifier(columnFor(name), dialect)} ${columnTypeFor(field, dialect)}`
}

function systemColumns(dialect: DatabaseDialect): SqlFragment[] {
  return [
    sql`${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key`,
    sql`${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null`,
    sql`${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null`,
    sql`${identifier('created_by', dialect)} ${textColumn(dialect, 64)}`,
    sql`${identifier('updated_by', dialect)} ${textColumn(dialect, 64)}`,
    sql`${identifier('status', dialect)} ${textColumn(dialect, 16)} not null`,
    // Nullable, and orthogonal to `status` (ADR-0022): an entry in the trash
    // keeps the status it had, so restoring it cannot silently demote it.
    sql`${identifier('deleted_at', dialect)} ${timestampColumn(dialect)}`,
    // Orthogonal to `status`, same reasoning (`schema@2.1`, ADR-0027):
    // 'none' rather than nullable, so an unfiltered `select *` from a client
    // written before this column existed sees a value it can safely ignore
    // instead of a NULL it has to special-case.
    sql`${identifier('review_state', dialect)} ${textColumn(dialect, 24)} not null`,
    sql`${identifier('assigned_reviewer', dialect)} ${textColumn(dialect, 64)}`,
    sql`${identifier('locale', dialect)} ${textColumn(dialect, 16)} not null`,
    sql`${identifier('translation_of', dialect)} ${uuidColumn(dialect)}`,
    sql`${identifier('version', dialect)} ${integerColumn()} not null`,
    sql`${identifier('provenance', dialect)} ${textColumn(dialect, 16)} not null`,
    sql`${identifier('provenance_detail', dialect)} ${jsonColumn()}`,
  ]
}

function entriesDdl(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const table = identifier(entriesTable(collection.name), dialect)
  const parts = systemColumns(dialect)

  for (const [name, field] of Object.entries(collection.fields)) {
    if (isColumnless(field)) continue
    parts.push(fieldColumn(name, field, dialect))
  }

  // A translation points at its source entry. Deleting the source leaves the
  // translations standing, orphaned rather than destroyed: losing a language
  // because someone removed the original is never the intent.
  parts.push(
    sql`constraint ${identifier(indexName(entriesTable(collection.name), 'source_fk'), dialect)}
        foreign key (${identifier('translation_of', dialect)})
        references ${table} (${identifier('id', dialect)}) on delete set null`,
  )

  for (const relation of relationsOf(collection)) {
    if (relation.many) continue
    parts.push(
      sql`constraint ${identifier(indexName(entriesTable(collection.name), `${columnFor(relation.field)}_fk`), dialect)}
          foreign key (${identifier(columnFor(relation.field), dialect)})
          references ${targetTable(relation, dialect)} (${identifier('id', dialect)})
          ${onDeleteClause(relation.onDelete)}`,
    )
  }

  return sql`create table if not exists ${table} (${joinFragments(parts, ', ')})`
}

function versionsDdl(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const table = identifier(versionsTable(collection.name), dialect)
  const entries = identifier(entriesTable(collection.name), dialect)

  return sql`create table if not exists ${table} (
    ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
    ${identifier('entry_id', dialect)} ${uuidColumn(dialect)} not null,
    ${identifier('version', dialect)} ${integerColumn()} not null,
    ${identifier('status', dialect)} ${textColumn(dialect, 16)} not null,
    ${identifier('data', dialect)} ${jsonColumn()} not null,
    ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
    ${identifier('created_by', dialect)} ${textColumn(dialect, 64)},
    constraint ${identifier(indexName(versionsTable(collection.name), 'entry_fk'), dialect)}
      foreign key (${identifier('entry_id', dialect)})
      references ${entries} (${identifier('id', dialect)}) on delete cascade,
    constraint ${identifier(indexName(versionsTable(collection.name), 'unique'), dialect)}
      unique (${identifier('entry_id', dialect)}, ${identifier('version', dialect)})
  )`
}

function blocksDdl(collection: CollectionDefinition, dialect: DatabaseDialect): SqlFragment {
  const table = identifier(blocksTable(collection.name), dialect)
  const entries = identifier(entriesTable(collection.name), dialect)

  return sql`create table if not exists ${table} (
    ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
    ${identifier('entry_id', dialect)} ${uuidColumn(dialect)} not null,
    ${identifier('version', dialect)} ${integerColumn()} not null,
    ${identifier('zone', dialect)} ${textColumn(dialect, 64)} not null,
    ${identifier('position', dialect)} ${integerColumn()} not null,
    ${identifier('block_key', dialect)} ${textColumn(dialect, 64)} not null,
    ${identifier('block_type', dialect)} ${textColumn(dialect, 64)} not null,
    ${identifier('data', dialect)} ${jsonColumn()} not null,
    constraint ${identifier(indexName(blocksTable(collection.name), 'entry_fk'), dialect)}
      foreign key (${identifier('entry_id', dialect)})
      references ${entries} (${identifier('id', dialect)}) on delete cascade,
    constraint ${identifier(indexName(blocksTable(collection.name), 'unique'), dialect)}
      unique (${identifier('entry_id', dialect)}, ${identifier('version', dialect)},
              ${identifier('zone', dialect)}, ${identifier('block_key', dialect)})
  )`
}

function joinDdl(
  collection: CollectionDefinition,
  relation: RelationTarget,
  dialect: DatabaseDialect,
): SqlFragment {
  const table = identifier(relationTable(collection.name, relation.field), dialect)

  return sql`create table if not exists ${table} (
    ${identifier('entry_id', dialect)} ${uuidColumn(dialect)} not null,
    ${identifier('target_id', dialect)} ${uuidColumn(dialect)} not null,
    ${identifier('position', dialect)} ${integerColumn()} not null,
    primary key (${identifier('entry_id', dialect)}, ${identifier('target_id', dialect)}),
    constraint ${identifier(indexName(relationTable(collection.name, relation.field), 'entry_fk'), dialect)}
      foreign key (${identifier('entry_id', dialect)})
      references ${identifier(entriesTable(collection.name), dialect)} (${identifier('id', dialect)})
      on delete cascade,
    constraint ${identifier(indexName(relationTable(collection.name, relation.field), 'target_fk'), dialect)}
      foreign key (${identifier('target_id', dialect)})
      references ${targetTable(relation, dialect)} (${identifier('id', dialect)})
      ${onDeleteClause(relation.onDelete)}
  )`
}

/**
 * The terms of one taxonomy (`schema@2.0`, ADR-0022).
 *
 * One table per taxonomy rather than one shared table with a `taxonomy`
 * column: the foreign key of a `f.taxonomy({ of: 'category' })` field then
 * *means* "a category", enforced by the database, instead of meaning "any term
 * of any taxonomy, and we promise to filter".
 *
 * `path` is the materialised path — `/<ancestor>/…/<self>/`, ids rather than
 * slugs so that renaming a term rewrites nothing. "Everything under this term"
 * is `path like '<its path>%'`, which Postgres, MySQL/MariaDB and SQLite all
 * answer the same way; a recursive CTE would not (ADR-0006).
 */
function taxonomyDdl(taxonomy: TaxonomyDefinition, dialect: DatabaseDialect): SqlFragment {
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

function taxonomyIndexes(taxonomy: TaxonomyDefinition, dialect: DatabaseDialect): SqlFragment[] {
  const name = taxonomyTable(taxonomy.name)
  const table = identifier(name, dialect)

  return [
    // A slug is unique across the taxonomy, not per parent: it is what a URL
    // carries, and two "cuisine" under two parents would make /category/cuisine
    // ambiguous.
    sql`create unique index ${identifier(indexName(name, 'slug_unique'), dialect)}
        on ${table} (${identifier('slug', dialect)})`,
    sql`create index ${identifier(indexName(name, 'path'), dialect)}
        on ${table} (${identifier('path', dialect)})`,
    sql`create index ${identifier(indexName(name, 'parent'), dialect)}
        on ${table} (${identifier('parent_id', dialect)}, ${identifier('position', dialect)})`,
  ]
}

const DIRECTIONS = new Set(['asc', 'desc'])

/**
 * The indexes every collection gets, plus the ones it declares.
 *
 * `create index` has no portable `if not exists` (MySQL 8 has none), so a
 * failure is swallowed: the only realistic cause is that the index is already
 * there. The same trade-off the queue driver makes.
 */
function indexStatements(
  collection: CollectionDefinition,
  dialect: DatabaseDialect,
): SqlFragment[] {
  const name = entriesTable(collection.name)
  const table = identifier(name, dialect)
  const statements: SqlFragment[] = [
    sql`create index ${identifier(indexName(name, 'locale_status'), dialect)}
        on ${table} (${identifier('locale', dialect)}, ${identifier('status', dialect)})`,
    sql`create index ${identifier(indexName(name, 'translation'), dialect)}
        on ${table} (${identifier('translation_of', dialect)})`,
    // Every read filters on `deleted_at is null` now (ADR-0022), so this is on
    // the hot path of the whole product, not only of the trash screen.
    sql`create index ${identifier(indexName(name, 'trash'), dialect)}
        on ${table} (${identifier('deleted_at', dialect)})`,
    // The review queue's whole read path (L37 task 3): "everything pending",
    // "everything assigned to me" and "my own submissions" all filter on
    // these two columns together.
    sql`create index ${identifier(indexName(name, 'review'), dialect)}
        on ${table} (${identifier('review_state', dialect)}, ${identifier('assigned_reviewer', dialect)})`,
  ]

  for (const [field, definition] of Object.entries(collection.fields)) {
    if (definition.unique !== true || isColumnless(definition)) continue
    // Unique **per locale**: with one entry per language (ADR-0014), a slug
    // unique across the table would forbid the same slug in French and English,
    // which is the normal case, not an error.
    statements.push(
      sql`create unique index ${identifier(indexName(name, `${columnFor(field)}_unique`), dialect)}
          on ${table} (${identifier('locale', dialect)}, ${identifier(columnFor(field), dialect)})`,
    )
  }

  for (const [position, declared] of (collection.indexes ?? []).entries()) {
    const columns = [...declared]
    const last = columns.at(-1)
    // Contract A writes `['publishedAt', 'desc']`: a trailing 'asc'/'desc' that
    // is not itself a field is the direction, not a second column.
    if (last !== undefined && DIRECTIONS.has(last) && collection.fields[last] === undefined) {
      columns.pop()
    }
    if (columns.length === 0) continue

    statements.push(
      sql`create index ${identifier(indexName(name, `idx_${position}`), dialect)}
          on ${table} (${joinFragments(
            columns.map((column) => identifier(columnFor(column), dialect)),
            ', ',
          )})`,
    )
  }

  return statements
}

async function createOne(executor: SqlExecutor, collection: CollectionDefinition): Promise<void> {
  assertUsableFields(collection)
  const dialect = executor.dialect

  await executor.query(entriesDdl(collection, dialect))
  await executor.query(versionsDdl(collection, dialect))
  await executor.query(blocksDdl(collection, dialect))

  for (const relation of relationsOf(collection)) {
    if (!relation.many) continue
    await executor.query(joinDdl(collection, relation, dialect))
  }

  for (const statement of indexStatements(collection, dialect)) {
    await executor.query(statement).catch(() => undefined)
  }
}

/**
 * Creates the tables of a set of collections, targets first.
 *
 * A foreign key is declared inside `create table` rather than added afterwards,
 * because SQLite has no `alter table add constraint` at all. That makes the
 * order matter, hence the sort — and makes a cycle between two collections
 * something to report rather than to half-create.
 *
 * Taxonomies are created **before** any collection, for the same reason: a
 * `f.taxonomy({ of: 'category' })` field carries a real foreign key to the
 * terms table, which therefore has to exist first.
 */
export async function createSchemaTables(
  db: DatabaseHandle,
  collections: readonly CollectionDefinition[],
  taxonomies: readonly TaxonomyDefinition[] = [],
): Promise<void> {
  for (const taxonomy of taxonomies) {
    await db.query(taxonomyDdl(taxonomy, db.dialect))
    for (const statement of taxonomyIndexes(taxonomy, db.dialect)) {
      await db.query(statement).catch(() => undefined)
    }
  }

  for (const collection of orderByDependency(collections)) {
    await createOne(db, collection)
  }
}

export function orderByDependency(
  collections: readonly CollectionDefinition[],
): CollectionDefinition[] {
  const byName = new Map(collections.map((collection) => [collection.name, collection]))
  const ordered: CollectionDefinition[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()

  const visit = (collection: CollectionDefinition, trail: readonly string[]): void => {
    if (done.has(collection.name)) return
    if (visiting.has(collection.name)) {
      throw new CogentaError({
        code: 'CONFIG_INVALID',
        message: `The collections ${[...trail, collection.name].join(' → ')} reference each other in a cycle.`,
        hint: 'SQLite cannot add a foreign key after the fact, so one of the two relations has to be optional and created in a later migration.',
        details: { cycle: [...trail, collection.name] },
      })
    }

    visiting.add(collection.name)
    for (const relation of relationsOf(collection)) {
      // A self-reference is fine: the table exists by the time the row is written.
      if (relation.to === collection.name) continue
      const target = byName.get(relation.to)
      if (target !== undefined) visit(target, [...trail, collection.name])
    }
    visiting.delete(collection.name)

    done.add(collection.name)
    ordered.push(collection)
  }

  for (const collection of collections) visit(collection, [])
  return ordered
}

/** Drops a collection's tables, dependents first. For tests and for a rollback. */
export async function dropSchemaTables(
  db: DatabaseHandle,
  collections: readonly CollectionDefinition[],
  taxonomies: readonly TaxonomyDefinition[] = [],
): Promise<void> {
  const dialect = db.dialect

  for (const collection of orderByDependency(collections).reverse()) {
    for (const relation of relationsOf(collection)) {
      if (!relation.many) continue
      await db.query(
        sql`drop table if exists ${identifier(relationTable(collection.name, relation.field), dialect)}`,
      )
    }
    await db.query(sql`drop table if exists ${identifier(blocksTable(collection.name), dialect)}`)
    await db.query(sql`drop table if exists ${identifier(versionsTable(collection.name), dialect)}`)
    await db.query(sql`drop table if exists ${identifier(entriesTable(collection.name), dialect)}`)
  }

  // Terms last: a collection's join table holds a foreign key into them.
  for (const taxonomy of taxonomies) {
    await db.query(sql`drop table if exists ${identifier(taxonomyTable(taxonomy.name), dialect)}`)
  }
}
