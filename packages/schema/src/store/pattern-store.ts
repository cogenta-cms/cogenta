import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import { newId as uuidv7 } from '../id.js'
import type { Provenance } from '../types.js'
import { joinFragments } from './fragments.js'
import type { PatternKind } from './pattern-tables.js'
import { PATTERN_TABLE } from './pattern-tables.js'

/**
 * The persistence layer of the page builder's pattern/template library
 * (fiche 43 sub-chantier A; fiche 05 task 1).
 *
 * Deliberately **not** content (contract A): a pattern carries no `status`,
 * no `version`, no trash, no `translationOf` — it is a shape an editor
 * composes from existing blocks, not a published thing of its own. It does
 * carry `provenance`/`provenanceDetail`, in the same two-value/detail shape
 * contract A uses for an entry, because the same question applies just as
 * much here: a pattern an agent generated must never read back
 * indistinguishable from one a person built by hand (the EU AI Act
 * disclosure obligation `docs/03-decisions.md` already tracks for content).
 */

export type { PatternKind } from './pattern-tables.js'

/** Same shape contract A's `provenanceDetail` carries, kept local rather than imported: a pattern is not an entry, and this table has no dependency on `store/types.ts`. */
export interface PatternProvenanceDetail {
  readonly agent?: string
  readonly model?: string
  readonly at?: string
  readonly prompt?: string
}

/** The wire shape of one block — identical to contract A's `ContentBlock`, kept local for the same reason as `PatternProvenanceDetail`. */
export interface PatternBlock {
  readonly key: string
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
}

export interface Pattern {
  readonly id: string
  readonly name: string
  /** An admin-only, free-form grouping label — never validated against a fixed set (unlike contract B's own vocabulary). */
  readonly category: string | null
  readonly kind: PatternKind
  readonly blocks: readonly PatternBlock[]
  readonly provenance: Provenance
  readonly provenanceDetail: PatternProvenanceDetail | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreatePatternInput {
  readonly id?: string
  readonly name: string
  readonly category?: string | null
  readonly kind: PatternKind
  readonly blocks: readonly PatternBlock[]
  /** Defaults to `'human'` — the same default contract A's own store uses. */
  readonly provenance?: Provenance
  readonly provenanceDetail?: PatternProvenanceDetail | null
}

export interface UpdatePatternInput {
  readonly name?: string
  /** Absent leaves it untouched; `null` clears it; a string reassigns it. */
  readonly category?: string | null
}

export interface ListPatternsOptions {
  readonly kind?: PatternKind
}

export interface PatternStoreOptions {
  readonly db: DatabaseHandle
  /** Injectable so tests can pin time; nothing else should pass it. */
  readonly now?: () => Date
  readonly newId?: () => string
}

export interface PatternStore {
  create(input: CreatePatternInput): Promise<Pattern>
  read(id: string): Promise<Pattern | null>
  update(id: string, input: UpdatePatternInput): Promise<Pattern>
  delete(id: string): Promise<boolean>
  list(options?: ListPatternsOptions): Promise<readonly Pattern[]>
}

type Row = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

function parseBlocks(raw: unknown): readonly PatternBlock[] {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(parsed)) return []
  return parsed as readonly PatternBlock[]
}

function parseProvenanceDetail(raw: unknown): PatternProvenanceDetail | null {
  if (raw === null || raw === undefined) return null
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  return (parsed ?? null) as PatternProvenanceDetail | null
}

function patternNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'PATTERN_UNKNOWN',
    message: `No pattern "${id}".`,
    hint: 'Check the identifier — list the patterns of this site to find the right one.',
    details: { id },
  })
}

export function createPatternStore(options: PatternStoreOptions): PatternStore {
  const { db } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const newId = options.newId ?? uuidv7

  const patterns = identifier(PATTERN_TABLE, dialect)
  const idColumn = identifier('id', dialect)
  const kindColumn = identifier('kind', dialect)
  const createdAtColumn = identifier('created_at', dialect)
  const updatedAtColumn = identifier('updated_at', dialect)

  const stamp = (): string => now().toISOString()

  function toPattern(row: Row): Pattern {
    return {
      id: text(row.id),
      name: text(row.name),
      category: nullableText(row.category),
      kind: text(row.kind) as PatternKind,
      blocks: parseBlocks(row.blocks),
      provenance: text(row.provenance) as Provenance,
      provenanceDetail: parseProvenanceDetail(row.provenance_detail),
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
    }
  }

  async function rowOf(tx: SqlExecutor, id: string): Promise<Row | null> {
    const found = await tx.query<Row>(sql`select * from ${patterns} where ${idColumn} = ${id}`)
    return found.rows[0] ?? null
  }

  return {
    create: async (input) => {
      const id = input.id ?? newId()
      const at = stamp()
      await db.query(
        sql`insert into ${patterns} (${joinFragments(
          [
            idColumn,
            identifier('name', dialect),
            identifier('category', dialect),
            kindColumn,
            identifier('blocks', dialect),
            identifier('provenance', dialect),
            identifier('provenance_detail', dialect),
            createdAtColumn,
            updatedAtColumn,
          ],
          ', ',
        )}) values (
          ${id}, ${input.name}, ${input.category ?? null}, ${input.kind},
          ${JSON.stringify(input.blocks)},
          ${input.provenance ?? ('human' satisfies Provenance)},
          ${input.provenanceDetail === undefined || input.provenanceDetail === null ? null : JSON.stringify(input.provenanceDetail)},
          ${at}, ${at}
        )`,
      )
      const row = await rowOf(db, id)
      if (row === null) throw patternNotFound(id)
      return toPattern(row)
    },

    read: async (id) => {
      const row = await rowOf(db, id)
      return row === null ? null : toPattern(row)
    },

    update: async (id, input) =>
      db.transaction(
        async (tx) => {
          const row = await rowOf(tx, id)
          if (row === null) throw patternNotFound(id)

          const assignments: SqlFragment[] = [sql`${updatedAtColumn} = ${stamp()}`]
          if (input.name !== undefined) {
            assignments.push(sql`${identifier('name', dialect)} = ${input.name}`)
          }
          if (input.category !== undefined) {
            assignments.push(sql`${identifier('category', dialect)} = ${input.category}`)
          }
          await tx.query(
            sql`update ${patterns} set ${joinFragments(assignments, ', ')} where ${idColumn} = ${id}`,
          )

          const after = await rowOf(tx, id)
          if (after === null) throw patternNotFound(id)
          return toPattern(after)
        },
        { immediate: true },
      ),

    delete: async (id) => {
      const removed = await db.query(sql`delete from ${patterns} where ${idColumn} = ${id}`)
      return removed.rowsAffected > 0
    },

    list: async (listOptions = {}) => {
      const found = await db.query<Row>(
        listOptions.kind === undefined
          ? sql`select * from ${patterns} order by ${createdAtColumn} desc`
          : sql`select * from ${patterns} where ${kindColumn} = ${listOptions.kind} order by ${createdAtColumn} desc`,
      )
      return found.rows.map(toPattern)
    },
  }
}
