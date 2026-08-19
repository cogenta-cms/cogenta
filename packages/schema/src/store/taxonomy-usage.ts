import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import type { CollectionDefinition, TaxonomyDefinition, TaxonomyTerm } from '../types.js'
import { columnFor, entriesTable, relationTable } from './naming.js'
import { relationsOf } from './tables.js'

/**
 * How many entries carry a term (`08-taxonomies.md`, task 3).
 *
 * Two figures, because they answer two different questions: `own` is what a
 * caller needs before renaming a term nobody meant to touch twice, and
 * `withDescendants` is what a caller needs before deleting a branch — "Cuisine"
 * itself may classify nothing while "Desserts" underneath it classifies forty
 * articles, and a delete-confirmation that only showed `own` would call that
 * branch empty.
 */
export interface TermUsage {
  readonly own: number
  readonly withDescendants: number
}

export interface CountTaxonomyUsageOptions {
  readonly db: DatabaseHandle
  readonly taxonomy: TaxonomyDefinition
  /** The taxonomy's terms, already fetched — this never re-lists them. */
  readonly terms: readonly TaxonomyTerm[]
  /** Every collection the site declares; only the ones referencing this taxonomy are queried. */
  readonly collections: readonly CollectionDefinition[]
  /**
   * Whether the caller may read this collection at all. A collection this
   * actor cannot read contributes nothing — not even a zero, which would
   * still disclose that it exists.
   */
  readonly readable: (collectionName: string) => boolean
  /**
   * Whether unpublished entries of this collection count too. The permission
   * layer decides this, once, per collection — this function never guesses.
   */
  readonly includeDrafts: (collectionName: string) => boolean
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Counts how many entries carry each term of a taxonomy, direct and with
 * descendants.
 *
 * One `group by` per taxonomy field found across the site's collections —
 * never a query per term, which would be one round trip per row of a
 * three-hundred-term taxonomy. The subtree figure is then a plain tree
 * aggregation over `terms`, which the caller already has: no second read of
 * the materialised path, and no recursive CTE (ADR-0006).
 */
export async function countTaxonomyUsage(
  options: CountTaxonomyUsageOptions,
): Promise<ReadonlyMap<string, TermUsage>> {
  const { db, taxonomy, terms, collections, readable, includeDrafts } = options
  const dialect = db.dialect

  const own = new Map<string, number>()
  const addOwn = (termId: string, count: number): void => {
    if (count === 0) return
    own.set(termId, (own.get(termId) ?? 0) + count)
  }

  const deletedAtColumn = identifier('deleted_at', dialect)
  const statusColumn = identifier('status', dialect)
  const idColumn = identifier('id', dialect)
  const cntAlias = identifier('cnt', dialect)
  const termIdAlias = identifier('term_id', dialect)

  for (const collection of collections) {
    if (!readable(collection.name)) continue

    const relevant = relationsOf(collection).filter(
      (relation) => relation.kind === 'taxonomy' && relation.to === taxonomy.name,
    )
    if (relevant.length === 0) continue

    const entries = identifier(entriesTable(collection.name), dialect)
    // Drafts count too only when this actor may read them on this very
    // collection — the same door `canReadUnpublished` guards everywhere else
    // (BLOCKERS.md: "le compteur peut fuiter").
    const statusFilter = includeDrafts(collection.name)
      ? sql``
      : sql` and ${statusColumn} = ${'published'}`

    for (const relation of relevant) {
      if (relation.many) {
        const join = identifier(relationTable(collection.name, relation.field), dialect)
        const targetColumn = identifier('target_id', dialect)
        const entryIdColumn = identifier('entry_id', dialect)

        const found = await db.query<{ term_id: unknown; cnt: unknown }>(
          sql`select jt.${targetColumn} as ${termIdAlias}, count(distinct jt.${entryIdColumn}) as ${cntAlias}
              from ${join} jt
              join ${entries} e on e.${idColumn} = jt.${entryIdColumn}
              where e.${deletedAtColumn} is null${statusFilter}
              group by jt.${targetColumn}`,
        )
        for (const row of found.rows) addOwn(String(row.term_id), toNumber(row.cnt))
      } else {
        const column = identifier(columnFor(relation.field), dialect)

        const found = await db.query<{ term_id: unknown; cnt: unknown }>(
          sql`select ${column} as ${termIdAlias}, count(*) as ${cntAlias}
              from ${entries}
              where ${deletedAtColumn} is null and ${column} is not null${statusFilter}
              group by ${column}`,
        )
        for (const row of found.rows) addOwn(String(row.term_id), toNumber(row.cnt))
      }
    }
  }

  // Tree aggregation, post-order, over the terms the caller already fetched —
  // parent pointers rather than the materialised path, because the admin
  // client never sees the path (it is a storage decision, ADR-0022) and this
  // function is written to need nothing more than what a client already has.
  const childrenOf = new Map<string | null, string[]>()
  for (const term of terms) {
    const list = childrenOf.get(term.parent) ?? []
    list.push(term.id)
    childrenOf.set(term.parent, list)
  }

  const withDescendants = new Map<string, number>()
  const subtreeTotal = (id: string): number => {
    const cached = withDescendants.get(id)
    if (cached !== undefined) return cached
    let total = own.get(id) ?? 0
    for (const childId of childrenOf.get(id) ?? []) total += subtreeTotal(childId)
    withDescendants.set(id, total)
    return total
  }
  for (const term of terms) subtreeTotal(term.id)

  const result = new Map<string, TermUsage>()
  for (const term of terms) {
    result.set(term.id, {
      own: own.get(term.id) ?? 0,
      withDescendants: withDescendants.get(term.id) ?? 0,
    })
  }
  return result
}
