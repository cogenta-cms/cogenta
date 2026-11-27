import { CogentaError, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { isMintedId } from './columns.js'
import { retryOnUniqueViolation } from './role-permission-store.js'
import {
  DEFAULT_TERM_ARCHIVE_DISPLAY_MODE,
  TERM_ARCHIVE_DISPLAY_MODES,
  TERM_ARCHIVE_DISPLAY_TABLE,
  type TermArchiveDisplayMode,
} from './term-archive-display-tables.js'

/**
 * Persistence of what a taxonomy term's public archive page shows.
 *
 * Deliberately **not** a field of a term (contract A, ADR-0022): see
 * `term-archive-display-tables.ts`. The store never looks at the taxonomy
 * tables — whether a term exists is the caller's question (the REST route
 * asks the taxonomy store first), so a row for a term deleted by another path
 * is harmless: nothing reads it, and `remove`/`removeMany` clean it up.
 */

export interface TermArchiveDisplayStoreOptions {
  readonly db: DatabaseHandle
  /** Injectable so tests can pin time; nothing else should pass it. */
  readonly now?: () => Date
}

export interface TermArchiveDisplayStore {
  /** The term's mode; `entries` when nothing is stored. */
  get(taxonomy: string, termId: string): Promise<TermArchiveDisplayMode>
  /** Every non-default mode of a taxonomy, by term id. A term absent from the map is `entries`. */
  getMany(taxonomy: string): Promise<ReadonlyMap<string, TermArchiveDisplayMode>>
  /** Stores the mode. Setting `entries` deletes the row — the default is not stored. */
  set(
    taxonomy: string,
    termId: string,
    mode: TermArchiveDisplayMode,
  ): Promise<TermArchiveDisplayMode>
  /** Forgets one term's setting. `true` when a row was removed. */
  remove(taxonomy: string, termId: string): Promise<boolean>
  /** Forgets several terms' settings at once — what deleting a branch needs. */
  removeMany(taxonomy: string, termIds: readonly string[]): Promise<number>
}

export function isTermArchiveDisplayMode(value: unknown): value is TermArchiveDisplayMode {
  return (
    typeof value === 'string' && (TERM_ARCHIVE_DISPLAY_MODES as readonly string[]).includes(value)
  )
}

/** Narrows an unknown value to a mode or throws the typed error the route turns into a 400. */
export function assertTermArchiveDisplayMode(value: unknown): TermArchiveDisplayMode {
  if (isTermArchiveDisplayMode(value)) return value
  throw new CogentaError({
    code: 'TERM_ARCHIVE_DISPLAY_INVALID',
    message: `"${String(value)}" is not a term archive display mode.`,
    hint: `Use one of: ${TERM_ARCHIVE_DISPLAY_MODES.join(', ')}.`,
    details: { mode: typeof value === 'string' ? value : null },
  })
}

export function createTermArchiveDisplayStore(
  options: TermArchiveDisplayStoreOptions,
): TermArchiveDisplayStore {
  const { db } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const table = identifier(TERM_ARCHIVE_DISPLAY_TABLE, dialect)
  const taxonomyColumn = identifier('taxonomy', dialect)
  const termColumn = identifier('term_id', dialect)
  const modeColumn = identifier('mode', dialect)

  // Asked before the query for the reason `pattern-store.ts` gives: Postgres
  // treats a malformed uuid as an error rather than a miss, so an id that no
  // term can carry is answered "nothing stored" on every engine alike.
  const nameable = (termId: string): boolean => isMintedId(termId)

  return {
    get: async (taxonomy, termId) => {
      if (!nameable(termId)) return DEFAULT_TERM_ARCHIVE_DISPLAY_MODE
      const found = await db.query<{ mode: unknown }>(
        sql`select ${modeColumn} from ${table}
            where ${taxonomyColumn} = ${taxonomy} and ${termColumn} = ${termId}`,
      )
      const stored = found.rows[0]?.mode
      return isTermArchiveDisplayMode(stored) ? stored : DEFAULT_TERM_ARCHIVE_DISPLAY_MODE
    },

    getMany: async (taxonomy) => {
      const found = await db.query<{ term_id: unknown; mode: unknown }>(
        sql`select ${termColumn}, ${modeColumn} from ${table} where ${taxonomyColumn} = ${taxonomy}`,
      )
      const modes = new Map<string, TermArchiveDisplayMode>()
      for (const row of found.rows) {
        // A value this version does not know (a row written by a later one)
        // reads as the default rather than breaking a page.
        if (isTermArchiveDisplayMode(row.mode)) modes.set(String(row.term_id), row.mode)
      }
      return modes
    },

    set: async (taxonomy, termId, mode) => {
      const checked = assertTermArchiveDisplayMode(mode)
      if (!nameable(termId)) return DEFAULT_TERM_ARCHIVE_DISPLAY_MODE
      const at = now().toISOString()

      // Delete-then-insert, retried on a lost primary-key race, exactly like
      // `role-permission-store.ts`: `ON CONFLICT`, `ON DUPLICATE KEY` and
      // `INSERT OR REPLACE` are three statements across the three dialects.
      await retryOnUniqueViolation(async () =>
        db.transaction(
          async (tx) => {
            await tx.query(
              sql`delete from ${table}
                  where ${taxonomyColumn} = ${taxonomy} and ${termColumn} = ${termId}`,
            )
            if (checked === DEFAULT_TERM_ARCHIVE_DISPLAY_MODE) return
            await tx.query(
              sql`insert into ${table} (
                    ${taxonomyColumn}, ${termColumn}, ${modeColumn}, ${identifier('updated_at', dialect)}
                  ) values (${taxonomy}, ${termId}, ${checked}, ${at})`,
            )
          },
          { immediate: true },
        ),
      )
      return checked
    },

    remove: async (taxonomy, termId) => {
      if (!nameable(termId)) return false
      const removed = await db.query(
        sql`delete from ${table} where ${taxonomyColumn} = ${taxonomy} and ${termColumn} = ${termId}`,
      )
      return removed.rowsAffected > 0
    },

    removeMany: async (taxonomy, termIds) => {
      let removed = 0
      for (const termId of termIds) {
        if (!nameable(termId)) continue
        const result = await db.query(
          sql`delete from ${table} where ${taxonomyColumn} = ${taxonomy} and ${termColumn} = ${termId}`,
        )
        removed += result.rowsAffected
      }
      return removed
    },
  }
}
