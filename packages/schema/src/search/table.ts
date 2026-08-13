import { type DatabaseDialect, identifier, type SqlFragment, sql, unsafeRaw } from '@cogenta/core'
import { textColumn, uuidColumn } from '../store/columns.js'
import { joinFragments, valueList } from '../store/fragments.js'

/**
 * The physical index, shared by the three engines.
 *
 * One table for every collection rather than one per collection: a search box
 * is site-wide, and a union across twenty collection tables would have to be
 * rebuilt every time a schema changes. The engine-specific machinery — a
 * `tsvector` column, a `FULLTEXT` key, an FTS5 twin — hangs off this same set
 * of columns, so the filters and the row mapping are written once.
 *
 * The name is fixed rather than derived from a collection, so it is a constant
 * and not a `naming.ts` function.
 */
export const SEARCH_TABLE = 'cogenta_search'

/** SQLite only: the FTS5 virtual table. See `sqlite.ts`. */
export const SEARCH_FTS_TABLE = 'cogenta_search_fts'

export const SEARCH_COLUMNS = {
  entryId: 'entry_id',
  collection: 'collection',
  locale: 'locale',
  status: 'status',
  title: 'title',
  /** The folded, extracted text. Never the stored JSON. */
  content: 'content',
} as const

/**
 * `text` holds 64 KiB on MySQL, which a long article passes without trying.
 * Silently truncating an article's tail out of the index is the kind of bug
 * that is only ever noticed as "search does not find the end of my pages".
 */
function contentColumn(dialect: DatabaseDialect): SqlFragment {
  return unsafeRaw(dialect === 'mysql' ? 'longtext' : 'text')
}

export function baseColumns(dialect: DatabaseDialect): SqlFragment[] {
  return [
    sql`${identifier(SEARCH_COLUMNS.entryId, dialect)} ${uuidColumn(dialect)} not null`,
    sql`${identifier(SEARCH_COLUMNS.collection, dialect)} ${textColumn(dialect, 64)} not null`,
    sql`${identifier(SEARCH_COLUMNS.locale, dialect)} ${textColumn(dialect, 16)} not null`,
    sql`${identifier(SEARCH_COLUMNS.status, dialect)} ${textColumn(dialect, 16)} not null`,
    sql`${identifier(SEARCH_COLUMNS.title, dialect)} ${textColumn(dialect, 500)} not null`,
    sql`${identifier(SEARCH_COLUMNS.content, dialect)} ${contentColumn(dialect)} not null`,
  ]
}

/**
 * The collection leads the key so that clearing or re-indexing one collection
 * touches a contiguous range rather than the whole index. It is also what makes
 * indexing the same entry twice a rewrite instead of a duplicate row, which is
 * what every driver's upsert relies on.
 */
export function primaryKey(dialect: DatabaseDialect): SqlFragment {
  return sql`primary key (${identifier(SEARCH_COLUMNS.collection, dialect)},
                          ${identifier(SEARCH_COLUMNS.entryId, dialect)})`
}

/**
 * The filters that make a result legitimate.
 *
 * Every engine's `search` composes these before its own matching clause, and
 * none of them is optional: the locale and the state are what stop a draft or
 * another language reaching a reader who has no right to it.
 */
export function scopeFilters(
  dialect: DatabaseDialect,
  scope: {
    readonly locale: string
    readonly status: string
    readonly collections?: readonly string[]
  },
): SqlFragment[] {
  const filters: SqlFragment[] = [
    sql`${identifier(SEARCH_COLUMNS.locale, dialect)} = ${scope.locale}`,
    sql`${identifier(SEARCH_COLUMNS.status, dialect)} = ${scope.status}`,
  ]

  if (scope.collections !== undefined && scope.collections.length > 0) {
    filters.push(
      sql`${identifier(SEARCH_COLUMNS.collection, dialect)} in (${valueList([...scope.collections])})`,
    )
  }

  return filters
}

export function allOf(filters: readonly SqlFragment[]): SqlFragment {
  return joinFragments(filters, ' and ')
}

/** The projected columns, in one place so the row type matches on all three. */
export function selectedColumns(dialect: DatabaseDialect): SqlFragment {
  return joinFragments(
    [
      identifier(SEARCH_COLUMNS.entryId, dialect),
      identifier(SEARCH_COLUMNS.collection, dialect),
      identifier(SEARCH_COLUMNS.locale, dialect),
      identifier(SEARCH_COLUMNS.status, dialect),
      identifier(SEARCH_COLUMNS.title, dialect),
    ],
    ', ',
  )
}
