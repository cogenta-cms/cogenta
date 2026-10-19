import { CogentaError, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import {
  blocksTable,
  type CollectionDefinition,
  columnFor,
  deepEqual,
  entriesTable,
  isColumnless,
  relationTable,
  SYSTEM_COLUMNS,
  versionsTable,
} from '@cogenta/schema'
import { WORDPRESS_IMPORT_COLLECTIONS } from './collections.js'

function incompatible(collection: string, reasons: readonly string[]): CogentaError {
  return new CogentaError({
    code: 'IMPORT_MAPPING_INVALID',
    message: `WordPress import cannot use the existing "${collection}" collection: ${reasons.join('; ')}.`,
    hint: 'Use a fresh WordPress import site, or prepare an explicit reviewed schema migration before importing. For an existing site, use CSV or JSON with a mapping to its own schema. No content has been imported.',
    details: { collection, reasons },
  })
}

/** Declared schemas are checked at preview and again at apply, never migrated implicitly. */
export function assertWordPressCollectionsCompatible(
  collections: readonly CollectionDefinition[],
): void {
  for (const expected of WORDPRESS_IMPORT_COLLECTIONS) {
    const current = collections.find((collection) => collection.name === expected.name)
    if (current === undefined) continue
    const reasons: string[] = []
    for (const [name, field] of Object.entries(expected.fields)) {
      const actual = current.fields[name]
      if (actual === undefined) reasons.push(`missing field "${name}"`)
      else if (actual.kind !== field.kind)
        reasons.push(`"${name}" must be ${field.kind}, not ${actual.kind}`)
      else if (!deepEqual(actual.options, field.options))
        reasons.push(`"${name}" has incompatible field settings`)
    }
    for (const [name, field] of Object.entries(current.fields)) {
      if (expected.fields[name] === undefined && field.required === true)
        reasons.push(`additional required field "${name}"`)
    }
    if (reasons.length > 0) throw incompatible(expected.name, reasons)
  }
}

async function columns(db: DatabaseHandle, table: string): Promise<readonly string[]> {
  if (db.dialect === 'sqlite') {
    const result = await db.query<{ name: string }>(
      sql`pragma table_info(${identifier(table, db.dialect)})`,
    )
    return result.rows.map((row) => row.name)
  }
  const schema = db.dialect === 'postgres' ? sql`current_schema()` : sql`database()`
  const result = await db.query<{ column_name: string }>(sql`
    select column_name as ${identifier('column_name', db.dialect)} from information_schema.columns
    where table_schema = ${schema} and table_name = ${table}`)
  return result.rows.map((row) => row.column_name)
}

/** Read-only physical preflight also protects CLI callers without loaded declarations. */
export async function preflightWordPressTarget(
  db: DatabaseHandle,
  collections: readonly CollectionDefinition[] = [],
): Promise<void> {
  assertWordPressCollectionsCompatible(collections)
  for (const expected of WORDPRESS_IMPORT_COLLECTIONS) {
    const names = new Set(await columns(db, entriesTable(expected.name)))
    if (names.size === 0) continue
    const required = [
      ...SYSTEM_COLUMNS,
      ...Object.entries(expected.fields)
        .filter(([, field]) => !isColumnless(field))
        .map(([name]) => columnFor(name)),
    ]
    const reasons = required
      .filter((name) => !names.has(name))
      .map((name) => `missing storage column "${name}"`)
    for (const [name, field] of Object.entries(expected.fields)) {
      if (field.kind === 'blocks' && names.has(columnFor(name)))
        reasons.push(`"${name}" uses field storage instead of a block zone`)
      if (
        (field.kind === 'relation' || field.kind === 'taxonomy') &&
        field.options.many === true &&
        (await columns(db, relationTable(expected.name, name))).length === 0
      )
        reasons.push(`missing relation storage for "${name}"`)
    }
    if ((await columns(db, versionsTable(expected.name))).length === 0)
      reasons.push('missing version storage')
    if ((await columns(db, blocksTable(expected.name))).length === 0)
      reasons.push('missing block storage')
    if (reasons.length > 0) throw incompatible(expected.name, reasons)
  }
}
