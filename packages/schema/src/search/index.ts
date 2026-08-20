import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import { createMysqlSearch } from './mysql.js'
import { createPostgresSearch } from './postgres.js'
import { createSqliteSearch } from './sqlite.js'
import type { SearchDriver } from './types.js'

/**
 * Full-text search, one interface over three engines (L1, task 16).
 *
 * Nothing outside this folder knows whether the site is ranked by `ts_rank`,
 * by an InnoDB fulltext score or by BM25 — or, on a SQLite build without FTS5,
 * not ranked at all. What every caller does know is that the locale and the
 * state it asks for are the only ones it can be given.
 */

export type { Excerpt, ExcerptMatch } from './extract.js'
export {
  buildExcerpt,
  extractBlockText,
  extractRichText,
  searchDocumentFor,
  titleOf,
} from './extract.js'
export type { MysqlSearchOptions } from './mysql.js'
export { createMysqlSearch } from './mysql.js'
export type { PostgresSearchOptions } from './postgres.js'
export { configurationFor, createPostgresSearch } from './postgres.js'
export type { SqliteSearchOptions } from './sqlite.js'
export { createSqliteSearch } from './sqlite.js'
export { SEARCH_COLUMNS, SEARCH_FTS_TABLE, SEARCH_TABLE } from './table.js'
export { condense, foldText, MIN_TOKEN_LENGTH, queryTokens, tokenize } from './text.js'
export type {
  SearchDocument,
  SearchDriver,
  SearchHit,
  SearchQuery,
  SearchReference,
  SearchResults,
} from './types.js'

export interface SearchIndexOptions {
  readonly db: DatabaseHandle
  /** SQLite only: see `SqliteSearchOptions.fts5`. Ignored elsewhere. */
  readonly fts5?: boolean
}

/**
 * The search index for whichever database is connected.
 *
 * Creating it also creates the physical index — a table plus whatever the
 * engine needs around it — so a fresh install can index its first entry without
 * a migration having run. That is deliberate: search is derived data, it can be
 * rebuilt from the content at any time, and coupling it to the migration
 * history would make a rebuild a schema change.
 */
export async function createSearchIndex(options: SearchIndexOptions): Promise<SearchDriver> {
  const { db } = options

  if (db.dialect === 'postgres') return createPostgresSearch({ db })
  if (db.dialect === 'mysql') return createMysqlSearch({ db })
  if (db.dialect === 'sqlite') {
    return createSqliteSearch(options.fts5 === undefined ? { db } : { db, fts5: options.fts5 })
  }

  throw new CogentaError({
    code: 'DB_DIALECT_UNSUPPORTED',
    message: `No full-text search implementation for the "${String(db.dialect)}" dialect.`,
    hint: 'Cogenta indexes content on Postgres, MySQL/MariaDB and SQLite.',
    details: { dialect: db.dialect },
  })
}
