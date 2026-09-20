import {
  CogentaError,
  identifier,
  type SqlExecutor,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'
import { joinFragments } from './fragments.js'

/**
 * Changing a foreign key's `on delete` rule on SQLite, without losing a row.
 *
 * SQLite has no `alter table … drop constraint`, so the only way to change a
 * constraint is the rebuild the manual describes: new table, copy, drop old,
 * rename. Two things about doing it *inside a migration* are not obvious, and
 * both were measured against a real `node:sqlite` rather than assumed:
 *
 * 1. **`PRAGMA foreign_keys = OFF` is a no-op inside a transaction.** The
 *    manual's twelve-step procedure starts by turning enforcement off, before
 *    `BEGIN`. A migration never gets that chance: `createMigrator` runs `up`
 *    inside `db.transaction(…, { immediate: true })` on every dialect that has
 *    transactional DDL, and the pragma is silently ignored while a transaction
 *    is pending. So the rebuild here runs with foreign keys **on**.
 *
 * 2. **`drop table` therefore performs an implicit `delete from`**, which fires
 *    every foreign key action pointing at that table. Measured on Node 22.22
 *    (SQLite 3.46): dropping a collection's entries table deleted every row of
 *    its `_versions` and `_blocks` tables. `PRAGMA defer_foreign_keys = ON`
 *    does not help — it defers the *checks*, not the *actions*, and the rows
 *    were gone before the commit. A naive rebuild in a migration destroys the
 *    entire version history of the collection it is repairing.
 *
 * What makes it safe is emptying the referring tables **into scratch copies**
 * before the drop, and putting them back after the rename. Once no row points
 * at the table, neither `cascade` (which deletes), nor `set null` (which
 * quietly empties a column), nor `restrict` (which aborts) has anything to act
 * on. The closure is transitive: emptying a referrer can cascade into *its*
 * referrers, so those are copied too.
 *
 * The whole thing runs in the migrator's transaction, so an interruption at any
 * step rolls back to the starting state — including the scratch tables.
 *
 * Deliberately narrow, and it refuses rather than guesses. A table carrying a
 * `check` constraint, a `collate`, a generated column or `without rowid` cannot
 * be reproduced from `pragma table_info` alone, and reproducing it wrong is how
 * a rebuild loses something nobody notices for months. Cogenta's generator
 * emits none of those; a table that has one is reported, not rebuilt.
 */

/** Scratch tables live and die inside the migration's transaction. */
const SCRATCH_PREFIX = 'cogenta_rebuild_'

interface ColumnRow {
  readonly name: string
  readonly type: string
  readonly notnull: number
  readonly dflt_value: string | null
  readonly pk: number
}

interface ForeignKeyRow {
  readonly id: number
  readonly seq: number
  readonly table: string
  readonly from: string
  readonly to: string
  readonly on_update: string
  readonly on_delete: string
}

interface IndexListRow {
  readonly name: string
  readonly unique: number
  readonly origin: string
}

interface IndexInfoRow {
  readonly seqno: number
  readonly name: string | null
}

interface NamedSqlRow {
  readonly name: string
  readonly sql: string | null
}

/** The new `on delete` rule for one column's foreign key. */
export interface ForeignKeyRewrite {
  readonly column: string
  /** Exactly as SQLite spells it in `pragma foreign_key_list`. */
  readonly onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION'
}

/**
 * A type or a default read back out of the schema, on its way into new DDL.
 *
 * These two are the only strings here that cannot be quoted as identifiers, so
 * they are the only ones that need a shape check before `unsafeRaw` sees them.
 * Anything outside it is refused rather than concatenated.
 */
const SAFE_TYPE = /^[A-Za-z0-9_ ()',.+-]*$/u
const SAFE_DEFAULT = /^[A-Za-z0-9_ ()',.:+*/|<>=-]*$/u

const UNREPRODUCIBLE = /\bcheck\s*\(|\bcollate\b|\bgenerated\s+always\b|\bwithout\s+rowid\b/iu

function refuse(message: string, details: Record<string, unknown>): CogentaError {
  return new CogentaError({
    code: 'MIGRATION_FAILED',
    message,
    hint: 'This migration rebuilds the table from pragma introspection, which cannot express that. Change the constraint by hand, or ask for the migration to be extended.',
    details,
  })
}

async function rows<TRow>(tx: SqlExecutor, fragment: SqlFragment): Promise<TRow[]> {
  const result = await tx.query<TRow>(fragment)
  return result.rows
}

/** Every table that holds a foreign key into one of `targets`, transitively. */
async function referrerClosure(tx: SqlExecutor, target: string): Promise<string[]> {
  const tables = (
    await rows<{ name: string }>(
      tx,
      sql`select name from sqlite_master where type = ${'table'} and name not like ${'sqlite_%'}`,
    )
  ).map((row) => row.name)

  const parentsOf = new Map<string, string[]>()
  for (const table of tables) {
    const keys = await rows<ForeignKeyRow>(tx, sql`select * from pragma_foreign_key_list(${table})`)
    parentsOf.set(table, [...new Set(keys.map((key) => key.table))])
  }

  // Breadth first from the table being rebuilt, so the result runs
  // parents-before-children: restoring follows it, emptying reverses it.
  const found: string[] = []
  const seen = new Set([target])
  let frontier = [target]

  while (frontier.length > 0) {
    const next: string[] = []
    for (const table of tables) {
      if (seen.has(table)) continue
      const parents = parentsOf.get(table) ?? []
      if (!parents.some((parent) => frontier.includes(parent))) continue
      seen.add(table)
      found.push(table)
      next.push(table)
    }
    frontier = next
  }

  return found
}

function columnDefinition(column: ColumnRow): SqlFragment {
  if (!SAFE_TYPE.test(column.type)) {
    throw refuse(`Column "${column.name}" has a type this migration will not re-emit.`, {
      column: column.name,
      type: column.type,
    })
  }

  let definition = sql`${identifier(column.name, 'sqlite')} ${unsafeRaw(column.type)}`
  if (column.notnull === 1) definition = sql`${definition} not null`

  if (column.dflt_value !== null) {
    if (!SAFE_DEFAULT.test(column.dflt_value)) {
      throw refuse(`Column "${column.name}" has a default this migration will not re-emit.`, {
        column: column.name,
        default: column.dflt_value,
      })
    }
    definition = sql`${definition} default ${unsafeRaw(column.dflt_value)}`
  }

  return definition
}

/**
 * The foreign keys of the table, with the named columns' delete rule replaced.
 *
 * Reproduced **without a constraint name**: SQLite has no statement that names
 * one — there is no `drop constraint` — so a name here is decoration, and
 * inventing one that differs from what the generator writes would be worse than
 * having none.
 */
function foreignKeyDefinitions(
  keys: readonly ForeignKeyRow[],
  rewrites: readonly ForeignKeyRewrite[],
): SqlFragment[] {
  const byConstraint = new Map<number, ForeignKeyRow[]>()
  for (const key of keys) {
    byConstraint.set(key.id, [...(byConstraint.get(key.id) ?? []), key])
  }

  const definitions: SqlFragment[] = []

  for (const parts of [...byConstraint.values()]) {
    const ordered = [...parts].sort((left, right) => left.seq - right.seq)
    const first = ordered[0]
    if (first === undefined) continue

    // Only a single-column key can be rewritten by column name; a composite one
    // is left exactly as it was found.
    const rewrite =
      ordered.length === 1
        ? rewrites.find((candidate) => candidate.column === first.from)
        : undefined
    const onDelete = rewrite?.onDelete ?? first.on_delete

    definitions.push(
      sql`foreign key (${joinFragments(
        ordered.map((part) => identifier(part.from, 'sqlite')),
        ', ',
      )})
          references ${identifier(first.table, 'sqlite')} (${joinFragments(
            ordered.map((part) => identifier(part.to, 'sqlite')),
            ', ',
          )})
          on update ${unsafeRaw(first.on_update)} on delete ${unsafeRaw(onDelete)}`,
    )
  }

  return definitions
}

async function scratchNameFor(tx: SqlExecutor, table: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `${SCRATCH_PREFIX}${attempt}_${table}`.slice(0, 60)
    const taken = await rows<{ name: string }>(
      tx,
      sql`select name from sqlite_master where name = ${candidate}`,
    )
    if (taken.length === 0) return candidate
  }

  throw refuse(`Could not find a free scratch name for "${table}".`, { table })
}

/**
 * Rebuilds one table, changing only the `on delete` rule of the named columns.
 *
 * Everything else — columns, order, types, defaults, primary key, the other
 * foreign keys, unique constraints, indexes, triggers and every row of every
 * table that points at it — comes out the way it went in.
 */
export async function rebuildSqliteTableForeignKeys(
  tx: SqlExecutor,
  table: string,
  rewrites: readonly ForeignKeyRewrite[],
): Promise<void> {
  const quoted = identifier(table, 'sqlite')

  const definition = await rows<NamedSqlRow>(
    tx,
    sql`select name, sql from sqlite_master where type = ${'table'} and name = ${table}`,
  )
  const source = definition[0]?.sql
  if (source === undefined || source === null) {
    throw refuse(`There is no table named "${table}" to rebuild.`, { table })
  }
  if (UNREPRODUCIBLE.test(source)) {
    throw refuse(`"${table}" carries a clause this migration cannot reproduce.`, { table })
  }

  const columns = await rows<ColumnRow>(tx, sql`select * from pragma_table_info(${table})`)
  if (columns.length === 0) throw refuse(`"${table}" has no columns.`, { table })

  const keys = await rows<ForeignKeyRow>(tx, sql`select * from pragma_foreign_key_list(${table})`)
  for (const rewrite of rewrites) {
    if (keys.some((key) => key.from === rewrite.column)) continue
    throw refuse(`"${table}"."${rewrite.column}" has no foreign key to rewrite.`, {
      table,
      column: rewrite.column,
    })
  }

  const indexList = await rows<IndexListRow>(tx, sql`select * from pragma_index_list(${table})`)
  const createdIndexes = await rows<NamedSqlRow>(
    tx,
    sql`select name, sql from sqlite_master
        where type = ${'index'} and tbl_name = ${table} and sql is not null`,
  )
  const triggers = await rows<NamedSqlRow>(
    tx,
    sql`select name, sql from sqlite_master where type = ${'trigger'} and tbl_name = ${table}`,
  )

  // A `unique (…)` written inside `create table` shows up as an index with
  // origin 'u' and no sql of its own, so it has to be re-emitted as a table
  // constraint rather than as a `create unique index`.
  const uniqueConstraints: SqlFragment[] = []
  for (const index of indexList) {
    if (index.origin !== 'u') continue
    const members = await rows<IndexInfoRow>(
      tx,
      sql`select * from pragma_index_info(${index.name})`,
    )
    const names = [...members]
      .sort((left, right) => left.seqno - right.seqno)
      .map((member) => member.name)
    if (names.some((name) => name === null)) {
      throw refuse(`"${table}" has a unique constraint over an expression.`, {
        table,
        index: index.name,
      })
    }
    uniqueConstraints.push(
      sql`unique (${joinFragments(
        names.map((name) => identifier(String(name), 'sqlite')),
        ', ',
      )})`,
    )
  }

  const primaryKey = [...columns]
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)

  const parts: SqlFragment[] = columns.map(columnDefinition)
  if (primaryKey.length > 0) {
    parts.push(
      sql`primary key (${joinFragments(
        primaryKey.map((column) => identifier(column.name, 'sqlite')),
        ', ',
      )})`,
    )
  }
  parts.push(...uniqueConstraints, ...foreignKeyDefinitions(keys, rewrites))

  const columnList = joinFragments(
    columns.map((column) => identifier(column.name, 'sqlite')),
    ', ',
  )

  // Defers the *checks* to the commit, which is what lets the copy insert a row
  // whose `translation_of` names a sibling that has not been copied yet. It
  // does nothing about the actions — see the header — so the referring tables
  // are emptied below rather than trusted to this.
  await tx.query(sql`pragma defer_foreign_keys = on`)

  const referrers: { readonly table: string; readonly copy: string }[] = []
  for (const referrer of await referrerClosure(tx, table)) {
    referrers.push({ table: referrer, copy: await scratchNameFor(tx, referrer) })
  }

  // Deepest first: `restrict` is enforced immediately even when deferred, so a
  // table has to be emptied before the one it points at.
  for (const referrer of [...referrers].reverse()) {
    const copy = identifier(referrer.copy, 'sqlite')
    const target = identifier(referrer.table, 'sqlite')
    await tx.query(sql`create table ${copy} as select * from ${target}`)
    await tx.query(sql`delete from ${target}`)
  }

  const rebuilt = await scratchNameFor(tx, table)
  const rebuiltQuoted = identifier(rebuilt, 'sqlite')

  await tx.query(sql`create table ${rebuiltQuoted} (${joinFragments(parts, ', ')})`)
  await tx.query(
    sql`insert into ${rebuiltQuoted} (${columnList}) select ${columnList} from ${quoted}`,
  )
  // Nothing points at the table any more, so the implicit `delete from` this
  // performs fires no action at all.
  await tx.query(sql`drop table ${quoted}`)
  // Renaming rewrites the `references` clause of every table that names the
  // *renamed* table. The referrers name the original, which no longer exists,
  // so they are left alone and end up pointing at the table they always did.
  await tx.query(sql`alter table ${rebuiltQuoted} rename to ${quoted}`)

  for (const index of createdIndexes) {
    if (index.sql === null) continue
    await tx.query(unsafeRaw(index.sql))
  }
  for (const trigger of triggers) {
    if (trigger.sql === null) continue
    await tx.query(unsafeRaw(trigger.sql))
  }

  // Parents before children, the reverse of the emptying order.
  for (const referrer of referrers) {
    const copy = identifier(referrer.copy, 'sqlite')
    const target = identifier(referrer.table, 'sqlite')
    const referrerColumns = await rows<ColumnRow>(
      tx,
      sql`select * from pragma_table_info(${referrer.table})`,
    )
    const list = joinFragments(
      referrerColumns.map((column) => identifier(column.name, 'sqlite')),
      ', ',
    )
    await tx.query(sql`insert into ${target} (${list}) select ${list} from ${copy}`)
    await tx.query(sql`drop table ${copy}`)
  }

  const violations = await rows<Record<string, unknown>>(tx, sql`pragma foreign_key_check`)
  if (violations.length > 0) {
    throw refuse(`Rebuilding "${table}" left ${violations.length} foreign key violation(s).`, {
      table,
      violations: violations.length,
    })
  }
}
