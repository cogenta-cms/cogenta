import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  limit,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import type { CollectionDefinition, FieldDefinition } from '../types.js'
import { DEFAULT_SLUG_MAX_LENGTH, isSlug, type SlugifyOptions, slugify } from './slugify.js'

/**
 * A slug is unique **per collection and per locale**, never globally.
 *
 * That falls straight out of ADR-0014: one entry per language means the French
 * and the English article are two rows, and both are legitimately `/mon-article`
 * under their own locale prefix. Scoping uniqueness globally would force the
 * translation to invent a slug nobody asked for.
 */
export interface SlugScope {
  readonly collection: string
  readonly locale: string
  /** The entry being saved, so its own slug does not count as a collision. */
  readonly excludeId?: string
}

/** Answers "is this slug already used inside the scope?". */
export type SlugTakenCheck = (candidate: string) => boolean | Promise<boolean>

export interface UniqueSlugOptions extends SlugifyOptions {
  /**
   * How many suffixes to try before giving up. A bound exists so a broken
   * `isTaken` cannot spin forever; it is high enough that no real editorial
   * workload reaches it.
   */
  readonly maxAttempts?: number
}

const DEFAULT_MAX_ATTEMPTS = 1000

/**
 * The first free slug in the `base`, `base-2`, `base-3`… series.
 *
 * The suffix starts at 2 rather than 1 because the unsuffixed slug *is* the
 * first one: "article", "article-2" reads as a numbered pair, "article",
 * "article-1" reads as an off-by-one.
 */
export async function uniqueSlug(
  base: string,
  isTaken: SlugTakenCheck,
  options: UniqueSlugOptions = {},
): Promise<string> {
  const separator = options.separator ?? '-'
  const maxLength = options.maxLength ?? DEFAULT_SLUG_MAX_LENGTH
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  if (base.length === 0) {
    throw new CogentaError({
      code: 'CONTENT_SLUG_INVALID',
      message: 'An empty slug cannot be made unique.',
      hint: 'Derive the slug from a non-empty source field, or supply one by hand.',
    })
  }

  if (!(await isTaken(base))) return base

  for (let suffix = 2; suffix <= maxAttempts; suffix += 1) {
    // The suffix is part of the budget, not an extension of it: a slug that
    // grew past `maxLength` would be silently truncated by the column and two
    // "unique" slugs would collide in storage.
    const tail = `${separator}${suffix}`
    const candidate = `${base.slice(0, maxLength - tail.length)}${tail}`
    if (!(await isTaken(candidate))) return candidate
  }

  throw new CogentaError({
    code: 'CONTENT_SLUG_TAKEN',
    message: `No slug was free in the "${base}" series after ${maxAttempts} attempts.`,
    hint: 'Choose a more specific title, or set the slug by hand.',
    details: { base, maxAttempts },
  })
}

export interface SqlSlugScope extends SlugScope {
  readonly db: DatabaseHandle | SqlExecutor
  /** The table holding the entries of this collection. */
  readonly table: string
  readonly slugColumn?: string
  readonly localeColumn?: string
  readonly idColumn?: string
  /**
   * Set when one table holds several collections. Left unset when the schema
   * gives every collection its own table, where the table already is the scope.
   */
  readonly collectionColumn?: string
}

/**
 * A `SlugTakenCheck` backed by the database.
 *
 * Kept behind the same callback the pure helpers take, so slug generation can
 * be unit-tested without a database and the storage layer stays free to change
 * its table layout without touching this file.
 */
export function sqlSlugTaken(scope: SqlSlugScope): SlugTakenCheck {
  const { db } = scope
  const table = identifier(scope.table, db.dialect)
  const slugColumn = identifier(scope.slugColumn ?? 'slug', db.dialect)
  const localeColumn = identifier(scope.localeColumn ?? 'locale', db.dialect)
  const idColumn = identifier(scope.idColumn ?? 'id', db.dialect)

  return async (candidate: string): Promise<boolean> => {
    const collectionFilter =
      scope.collectionColumn === undefined
        ? sql``
        : sql` and ${identifier(scope.collectionColumn, db.dialect)} = ${scope.collection}`

    const exclusion =
      scope.excludeId === undefined ? sql`` : sql` and ${idColumn} <> ${scope.excludeId}`

    const found = await db.query(sql`
      select ${idColumn} from ${table}
      where ${slugColumn} = ${candidate}
        and ${localeColumn} = ${scope.locale}${collectionFilter}${exclusion}
      limit ${limit(1)}`)

    return found.rows.length > 0
  }
}

/**
 * The source text a `f.slug({ from: 'title' })` field derives from.
 *
 * Returns null when the field declares no source: such a slug is typed by the
 * editor, and inventing one would overwrite their choice.
 */
export function slugSourceField(field: FieldDefinition): string | null {
  const from = field.options.from
  return typeof from === 'string' && from.length > 0 ? from : null
}

export interface DeriveSlugInput {
  readonly collection: CollectionDefinition
  /** Name of the `slug` field inside the collection. */
  readonly field: string
  /** The entry being saved, before slug resolution. */
  readonly values: Readonly<Record<string, unknown>>
  /** Scoped by the caller: it already knows the collection, the locale and the entry. */
  readonly isTaken: SlugTakenCheck
  readonly options?: UniqueSlugOptions
}

/**
 * The slug an entry should be saved with: derived, transliterated, made unique.
 *
 * An explicit slug already present on the entry wins over the source field —
 * the editor overrode it on purpose — but is still normalised and still made
 * unique, because "already typed" is not "already free".
 */
export async function deriveSlug(input: DeriveSlugInput): Promise<string> {
  const field = input.collection.fields[input.field]
  if (field === undefined || field.kind !== 'slug') {
    throw new CogentaError({
      code: 'CONTENT_SLUG_INVALID',
      message: `Collection "${input.collection.name}" has no slug field named "${input.field}".`,
      hint: 'Declare it with f.slug({ from: … }), or name an existing slug field.',
      details: { collection: input.collection.name, field: input.field },
    })
  }

  const explicit = input.values[input.field]
  const source = slugSourceField(field)
  const raw =
    typeof explicit === 'string' && explicit.length > 0
      ? explicit
      : source === null
        ? ''
        : stringOf(input.values[source])

  if (raw.length === 0) {
    throw new CogentaError({
      code: 'CONTENT_SLUG_INVALID',
      message: `Nothing to build the "${input.field}" slug of "${input.collection.name}" from.`,
      hint:
        source === null
          ? `Fill in "${input.field}".`
          : `Fill in "${source}", or type "${input.field}" by hand.`,
      details: { collection: input.collection.name, field: input.field, from: source },
    })
  }

  const base = isSlug(raw, input.options) ? raw : slugify(raw, input.options)
  if (base.length === 0) {
    throw new CogentaError({
      code: 'CONTENT_SLUG_INVALID',
      message: `"${raw}" contains no character usable in a URL.`,
      hint: `Type "${input.field}" by hand. A non-Latin script cannot be transliterated automatically.`,
      details: { collection: input.collection.name, field: input.field },
    })
  }

  return uniqueSlug(base, input.isTaken, input.options ?? {})
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}
