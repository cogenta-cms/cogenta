import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import { newId as uuidv7 } from '../id.js'
import type { TaxonomyDefinition, TaxonomyTerm } from '../types.js'
import { joinFragments, valueList } from './fragments.js'
import { taxonomyTable } from './naming.js'
import { assertDepth, childPath, depthOf, isBelow, isWithin, rebasedPath } from './taxonomy-path.js'

/**
 * The persistence layer of one taxonomy (`schema@2.0`, ADR-0022).
 *
 * Deliberately *not* a `ContentStore`. A term has no status, no version, no
 * draft and no translation family — giving it those would tie a classification
 * to the content lifecycle for no gain, and would make ADR-0014 apply to
 * something it was never written about.
 *
 * The tree is a **materialised path**, maintained here on every write. Reads
 * are then free: "everything under this term" is one `like`, identical on the
 * three dialects ADR-0006 requires. Writes pay instead — creating a term reads
 * its parent, and moving a subtree rewrites the paths beneath it.
 */

export interface TaxonomyStoreOptions {
  readonly db: DatabaseHandle
  readonly taxonomy: TaxonomyDefinition
  /** Injectable so tests can pin time; nothing else should pass it. */
  readonly now?: () => Date
  readonly newId?: () => string
}

export interface CreateTermInput {
  /** Supply one to import a term that already has an identity elsewhere. */
  readonly id?: string
  readonly slug: string
  readonly labels: Readonly<Record<string, string>>
  readonly parent?: string | null
  /** Left out, the term goes last among its siblings. */
  readonly position?: number
}

export interface UpdateTermInput {
  readonly slug?: string
  readonly labels?: Readonly<Record<string, string>>
  readonly position?: number
}

export interface ListTermsOptions {
  /** Only the direct children of this term; `null` means the roots. */
  readonly parent?: string | null
  /** Everything at or below this term, in tree order. */
  readonly under?: string
}

export interface TaxonomyStore {
  create(input: CreateTermInput): Promise<TaxonomyTerm>
  read(id: string): Promise<TaxonomyTerm | null>
  bySlug(slug: string): Promise<TaxonomyTerm | null>
  update(id: string, input: UpdateTermInput): Promise<TaxonomyTerm>
  /** Re-parents a term and rewrites the whole subtree's paths. */
  move(id: string, parent: string | null): Promise<TaxonomyTerm>
  /** Every term, in tree order, or the slice `options` names. */
  list(options?: ListTermsOptions): Promise<readonly TaxonomyTerm[]>
  /** The term and everything beneath it, answered by one `like`. */
  subtree(id: string): Promise<readonly TaxonomyTerm[]>
  /** From the root down to this term, inclusive. For a breadcrumb. */
  ancestors(id: string): Promise<readonly TaxonomyTerm[]>
  /** Refuses while the term still has children, unless `cascade` is asked for. */
  delete(id: string, options?: { readonly cascade?: boolean }): Promise<boolean>
}

type Row = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

/** Never throws while reading: a hand-edited row must stay recoverable. */
function parseLabels(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const labels: Record<string, string> = {}
    for (const [locale, label] of Object.entries(parsed)) {
      if (typeof label === 'string') labels[locale] = label
    }
    return labels
  } catch {
    return {}
  }
}

export function createTaxonomyStore(options: TaxonomyStoreOptions): TaxonomyStore {
  const { db, taxonomy } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const newId = options.newId ?? uuidv7

  const table = identifier(taxonomyTable(taxonomy.name), dialect)
  const idColumn = identifier('id', dialect)
  const parentColumn = identifier('parent_id', dialect)
  const slugColumn = identifier('slug', dialect)
  const pathColumn = identifier('path', dialect)
  const positionColumn = identifier('position', dialect)

  const hierarchical = taxonomy.hierarchical !== false

  const stamp = (): string => now().toISOString()

  function termNotFound(id: string): CogentaError {
    return new CogentaError({
      code: 'TAXONOMY_TERM_NOT_FOUND',
      message: `No term "${id}" in the "${taxonomy.name}" taxonomy.`,
      hint: 'Check the identifier — a term of another taxonomy has its own table and will never be found here.',
      details: { taxonomy: taxonomy.name, id },
    })
  }

  function toTerm(row: Row): TaxonomyTerm {
    const path = text(row['path'])
    return {
      id: text(row['id']),
      taxonomy: taxonomy.name,
      parent: nullableText(row['parent_id']),
      slug: text(row['slug']),
      labels: parseLabels(row['labels']),
      position: Number(row['position']),
      path,
      depth: depthOf(path),
      createdAt: text(row['created_at']),
      updatedAt: text(row['updated_at']),
    }
  }

  async function rowOf(tx: SqlExecutor, id: string): Promise<Row | null> {
    const found = await tx.query<Row>(sql`select * from ${table} where ${idColumn} = ${id}`)
    return found.rows[0] ?? null
  }

  /**
   * Tree order: a parent immediately before its children, siblings by
   * `position`.
   *
   * Sorting on the path alone would order siblings by id, which is arbitrary;
   * sorting on `position` alone would interleave branches. Sorting on both,
   * with the path first, is what makes a flat list renderable as a tree
   * without a second pass.
   */
  const treeOrder: SqlFragment = sql`${pathColumn} asc, ${positionColumn} asc`

  async function assertSlugFree(tx: SqlExecutor, slug: string, exceptId?: string): Promise<void> {
    const found = await tx.query<Row>(
      sql`select ${idColumn} from ${table} where ${slugColumn} = ${slug}`,
    )
    const clash = found.rows.find((row) => text(row['id']) !== exceptId)
    if (clash === undefined) return

    throw new CogentaError({
      code: 'TAXONOMY_SLUG_TAKEN',
      message: `A "${taxonomy.name}" term already uses the slug "${slug}".`,
      hint: 'A slug is unique across the whole taxonomy, not per parent: it is what a URL carries, and two terms answering to one URL is not a tree, it is an ambiguity.',
      details: { taxonomy: taxonomy.name, slug },
    })
  }

  async function parentPathOf(tx: SqlExecutor, parent: string | null): Promise<string> {
    if (parent === null) return ''

    if (!hierarchical) {
      throw new CogentaError({
        code: 'TAXONOMY_NOT_HIERARCHICAL',
        message: `The "${taxonomy.name}" taxonomy is flat, so its terms cannot be nested.`,
        hint: 'Declare it with hierarchical: true if this taxonomy really is a tree — a flat one is refused here rather than storing a parent nothing renders.',
        details: { taxonomy: taxonomy.name },
      })
    }

    const row = await rowOf(tx, parent)
    if (row === null) throw termNotFound(parent)
    return text(row['path'])
  }

  /** Last position among a parent's children, so a new term lands at the end. */
  async function nextPosition(tx: SqlExecutor, parent: string | null): Promise<number> {
    const found = await tx.query<Row>(
      parent === null
        ? sql`select ${positionColumn} from ${table} where ${parentColumn} is null`
        : sql`select ${positionColumn} from ${table} where ${parentColumn} = ${parent}`,
    )
    return found.rows.reduce((highest, row) => Math.max(highest, Number(row['position']) + 1), 0)
  }

  return {
    create: async (input) =>
      db.transaction(
        async (tx) => {
          const id = input.id ?? newId()
          const parent = input.parent ?? null
          const parentPath = await parentPathOf(tx, parent)
          const path = childPath(parentPath, id)

          assertDepth(taxonomy.name, path)
          await assertSlugFree(tx, input.slug)

          const at = stamp()
          const position = input.position ?? (await nextPosition(tx, parent))

          await tx.query(
            sql`insert into ${table} (${joinFragments(
              [
                idColumn,
                parentColumn,
                slugColumn,
                identifier('labels', dialect),
                positionColumn,
                pathColumn,
                identifier('created_at', dialect),
                identifier('updated_at', dialect),
              ],
              ', ',
            )}) values (${id}, ${parent}, ${input.slug}, ${JSON.stringify(input.labels)},
                        ${position}, ${path}, ${at}, ${at})`,
          )

          const row = await rowOf(tx, id)
          if (row === null) throw termNotFound(id)
          return toTerm(row)
        },
        { immediate: true },
      ),

    read: async (id) => {
      const row = await rowOf(db, id)
      return row === null ? null : toTerm(row)
    },

    bySlug: async (slug) => {
      const found = await db.query<Row>(sql`select * from ${table} where ${slugColumn} = ${slug}`)
      const row = found.rows[0]
      return row === undefined ? null : toTerm(row)
    },

    update: async (id, input) =>
      db.transaction(
        async (tx) => {
          const row = await rowOf(tx, id)
          if (row === null) throw termNotFound(id)

          const assignments: SqlFragment[] = [
            sql`${identifier('updated_at', dialect)} = ${stamp()}`,
          ]

          if (input.slug !== undefined) {
            await assertSlugFree(tx, input.slug, id)
            // Renaming rewrites **nothing** in the tree: the path is built from
            // ids precisely so that a rename stays a one-row update.
            assignments.push(sql`${slugColumn} = ${input.slug}`)
          }
          if (input.labels !== undefined) {
            assignments.push(
              sql`${identifier('labels', dialect)} = ${JSON.stringify(input.labels)}`,
            )
          }
          if (input.position !== undefined) {
            assignments.push(sql`${positionColumn} = ${input.position}`)
          }

          await tx.query(
            sql`update ${table} set ${joinFragments(assignments, ', ')} where ${idColumn} = ${id}`,
          )

          const after = await rowOf(tx, id)
          if (after === null) throw termNotFound(id)
          return toTerm(after)
        },
        { immediate: true },
      ),

    move: async (id, parent) =>
      db.transaction(
        async (tx) => {
          const row = await rowOf(tx, id)
          if (row === null) throw termNotFound(id)

          const from = text(row['path'])
          const parentPath = await parentPathOf(tx, parent)

          // A term cannot become its own descendant. With a materialised path
          // this is a string test, not a walk: the impossible move is exactly
          // the one whose new parent already lives inside the subtree being
          // moved.
          if (parent !== null && isWithin(parentPath, from)) {
            throw new CogentaError({
              code: 'TAXONOMY_CYCLE',
              message: `Moving "${id}" under "${parent}" would make it its own ancestor.`,
              hint: 'Move the target out of this subtree first. A taxonomy is a tree, and a tree has no cycles — this is refused rather than stored and rendered as an infinite menu.',
              details: { taxonomy: taxonomy.name, id, parent },
            })
          }

          const to = childPath(parentPath, id)
          if (to === from) return toTerm(row)

          const subtree = await tx.query<Row>(
            sql`select * from ${table} where ${pathColumn} like ${`${from}%`}`,
          )

          // The deepest descendant decides whether the move fits: checking only
          // the moved term itself would let a three-level branch slide past the
          // bound and be refused later, half-moved.
          for (const member of subtree.rows) {
            assertDepth(taxonomy.name, rebasedPath(text(member['path']), from, to))
          }

          const at = stamp()
          for (const member of subtree.rows) {
            const memberId = text(member['id'])
            const rebased = rebasedPath(text(member['path']), from, to)
            await tx.query(
              sql`update ${table}
                  set ${pathColumn} = ${rebased}, ${identifier('updated_at', dialect)} = ${at}
                  where ${idColumn} = ${memberId}`,
            )
          }

          await tx.query(
            sql`update ${table}
                set ${parentColumn} = ${parent}, ${positionColumn} = ${await nextPosition(tx, parent)}
                where ${idColumn} = ${id}`,
          )

          const after = await rowOf(tx, id)
          if (after === null) throw termNotFound(id)
          return toTerm(after)
        },
        { immediate: true },
      ),

    list: async (listOptions = {}) => {
      if (listOptions.under !== undefined) {
        const row = await rowOf(db, listOptions.under)
        if (row === null) throw termNotFound(listOptions.under)
        const found = await db.query<Row>(
          sql`select * from ${table}
              where ${pathColumn} like ${`${text(row['path'])}%`}
              order by ${treeOrder}`,
        )
        return found.rows.map(toTerm)
      }

      if (listOptions.parent !== undefined) {
        const found = await db.query<Row>(
          listOptions.parent === null
            ? sql`select * from ${table} where ${parentColumn} is null order by ${treeOrder}`
            : sql`select * from ${table} where ${parentColumn} = ${listOptions.parent} order by ${treeOrder}`,
        )
        return found.rows.map(toTerm)
      }

      const found = await db.query<Row>(sql`select * from ${table} order by ${treeOrder}`)
      return found.rows.map(toTerm)
    },

    subtree: async (id) => {
      const row = await rowOf(db, id)
      if (row === null) throw termNotFound(id)

      const found = await db.query<Row>(
        sql`select * from ${table}
            where ${pathColumn} like ${`${text(row['path'])}%`}
            order by ${treeOrder}`,
      )
      return found.rows.map(toTerm)
    },

    ancestors: async (id) => {
      const row = await rowOf(db, id)
      if (row === null) throw termNotFound(id)

      // The path already *is* the ancestry, so this is one query by id list
      // rather than a walk of n queries up the tree.
      const ids = text(row['path'])
        .split('/')
        .filter((segment) => segment !== '')
      if (ids.length === 0) return []

      const found = await db.query<Row>(
        sql`select * from ${table} where ${idColumn} in (${valueList(ids)})`,
      )
      const byId = new Map(found.rows.map((member) => [text(member['id']), member]))
      return ids
        .map((ancestorId) => byId.get(ancestorId))
        .filter((member): member is Row => member !== undefined)
        .map(toTerm)
    },

    delete: async (id, deleteOptions) =>
      db.transaction(
        async (tx) => {
          const row = await rowOf(tx, id)
          if (row === null) return false

          const path = text(row['path'])
          const descendants = await tx.query<Row>(
            sql`select ${idColumn}, ${pathColumn} from ${table} where ${pathColumn} like ${`${path}%`}`,
          )
          const children = descendants.rows.filter((member) => isBelow(text(member['path']), path))

          // Refusing by default rather than cascading: deleting "Cuisine" must
          // not silently take "Desserts" and "Entrées" with it. The caller who
          // really means the whole branch says so.
          if (children.length > 0 && deleteOptions?.cascade !== true) {
            throw new CogentaError({
              code: 'TAXONOMY_TERM_HAS_CHILDREN',
              message: `The "${taxonomy.name}" term "${id}" still has ${children.length} descendant term(s).`,
              hint: 'Move them elsewhere first, or pass { cascade: true } to delete the whole branch. Nothing was changed.',
              details: { taxonomy: taxonomy.name, id, descendants: children.length },
            })
          }

          // The self-referencing foreign key is `on delete cascade`, so
          // removing the root of the branch takes the branch with it — one
          // statement, and the same behaviour on all three dialects.
          const removed = await tx.query(sql`delete from ${table} where ${idColumn} = ${id}`)
          return removed.rowsAffected > 0
        },
        { immediate: true },
      ),
  }
}
