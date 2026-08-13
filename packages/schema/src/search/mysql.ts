import {
  type DatabaseHandle,
  type HealthReport,
  identifier,
  type SqlFragment,
  sql,
  limit as sqlLimit,
} from '@cogenta/core'
import { joinFragments } from '../store/fragments.js'
import {
  assertDocument,
  assertReference,
  EMPTY_RESULTS,
  normaliseQuery,
  numeric,
  storedTitle,
  toResults,
} from './query.js'
import {
  allOf,
  baseColumns,
  primaryKey,
  SEARCH_COLUMNS,
  SEARCH_TABLE,
  scopeFilters,
  selectedColumns,
} from './table.js'
import { foldText, MIN_TOKEN_LENGTH } from './text.js'
import type { SearchDocument, SearchDriver, SearchQuery, SearchReference } from './types.js'

/**
 * MySQL and MariaDB full-text search: a `FULLTEXT` index, read in boolean mode.
 *
 * Boolean mode rather than natural language mode, for two reasons that both
 * bite in production. Natural language mode on MyISAM drops any word present in
 * more than half the rows — on a site where every page says the brand name,
 * searching for the brand returns nothing, with no error. And natural language
 * mode has no prefix operator, so a half-typed word matches nothing. Boolean
 * mode gives `+term*`: every term required, each one allowed to be a prefix,
 * which is the same semantics this package gives on the other two dialects.
 *
 * What it does not give is a comparable score. `MATCH … AGAINST` in boolean
 * mode returns a term-count-based number, not the IDF-weighted rank Postgres
 * computes. The L1 spec accepts that explicitly, so the contract suite asserts
 * which documents come back and never in which order they are ranked.
 */

const FULLTEXT_INDEX = 'cogenta_search_ft'
const SCOPE_INDEX = 'cogenta_search_scope'

/**
 * `+term*` for every term.
 *
 * Tokens are letters and digits only (see `text.ts`), so a reader typing
 * `-foo +bar*` gets two ordinary words rather than boolean operators, and the
 * index cannot be steered by the query string.
 */
function booleanExpression(tokens: readonly string[]): string {
  return tokens.map((token) => `+${token}*`).join(' ')
}

export interface MysqlSearchOptions {
  readonly db: DatabaseHandle
}

export async function createMysqlSearch(options: MysqlSearchOptions): Promise<SearchDriver> {
  const { db } = options
  const dialect = 'mysql' as const
  const table = identifier(SEARCH_TABLE, dialect)
  const content = identifier(SEARCH_COLUMNS.content, dialect)

  // The FULLTEXT key is declared inside `create table`: MySQL has no
  // `create index if not exists`, so adding it afterwards means either a
  // swallowed error or a catalogue lookup, and neither is worth a second
  // statement when the table is created here anyway.
  const columns: SqlFragment[] = [
    ...baseColumns(dialect),
    primaryKey(dialect),
    sql`fulltext key ${identifier(FULLTEXT_INDEX, dialect)} (${content})`,
    sql`key ${identifier(SCOPE_INDEX, dialect)} (${identifier(SEARCH_COLUMNS.locale, dialect)},
                                                 ${identifier(SEARCH_COLUMNS.status, dialect)})`,
  ]

  await db.query(sql`create table if not exists ${table} (${joinFragments(columns, ', ')})`)

  const assignments = [
    SEARCH_COLUMNS.locale,
    SEARCH_COLUMNS.status,
    SEARCH_COLUMNS.title,
    SEARCH_COLUMNS.content,
  ].map((column) => {
    const name = identifier(column, dialect)
    // `values(col)` rather than the newer row alias: MariaDB does not accept
    // `as new` at all, and this package is tested against both.
    return sql`${name} = values(${name})`
  })

  return {
    dialect,

    index: async (entry: SearchDocument): Promise<void> => {
      assertDocument(entry)

      await db.query(
        sql`insert into ${table} (
              ${identifier(SEARCH_COLUMNS.entryId, dialect)},
              ${identifier(SEARCH_COLUMNS.collection, dialect)},
              ${identifier(SEARCH_COLUMNS.locale, dialect)},
              ${identifier(SEARCH_COLUMNS.status, dialect)},
              ${identifier(SEARCH_COLUMNS.title, dialect)},
              ${content})
            values (${entry.id}, ${entry.collection}, ${entry.locale}, ${entry.status},
                    ${storedTitle(entry)}, ${foldText(`${entry.title} ${entry.body}`)})
            on duplicate key update ${joinFragments(assignments, ', ')}`,
      )
    },

    remove: async (reference: SearchReference): Promise<void> => {
      assertReference(reference)
      await db.query(
        sql`delete from ${table}
            where ${identifier(SEARCH_COLUMNS.collection, dialect)} = ${reference.collection}
              and ${identifier(SEARCH_COLUMNS.entryId, dialect)} = ${reference.id}`,
      )
    },

    search: async (query: SearchQuery) => {
      const normalised = normaliseQuery(query)
      if (normalised.tokens.length === 0) return EMPTY_RESULTS

      const expression = booleanExpression(normalised.tokens)
      const match = sql`match(${content}) against (${expression} in boolean mode)`
      const filters = scopeFilters(dialect, normalised)

      const found = await db.query<Record<string, unknown>>(
        sql`select ${selectedColumns(dialect)}, ${match} as ${identifier('score', dialect)}
            from ${table}
            where ${allOf([match, ...filters])}
            order by ${identifier('score', dialect)} desc,
                     ${identifier(SEARCH_COLUMNS.entryId, dialect)} asc
            limit ${sqlLimit(normalised.size + 1)} offset ${sqlLimit(normalised.offset)}`,
      )

      return toResults(found.rows, (row) => numeric(row['score']), normalised)
    },

    clear: async (scope) => {
      const where =
        scope?.collection === undefined
          ? sql``
          : sql` where ${identifier(SEARCH_COLUMNS.collection, dialect)} = ${scope.collection}`
      await db.query(sql`delete from ${table}${where}`)
    },

    health: async (): Promise<HealthReport> => {
      const started = Date.now()
      const counted = await db.query<{ total: unknown }>(
        sql`select count(*) as ${identifier('total', dialect)} from ${table}`,
      )
      return {
        status: 'ok',
        driver: 'mysql',
        tier: 'optimal',
        latencyMs: Date.now() - started,
        // Stated rather than hidden: the server, not Cogenta, decides the floor,
        // and an administrator who wonders why a two-letter word finds nothing
        // needs to be pointed at `innodb_ft_min_token_size`.
        message: `FULLTEXT search in boolean mode. Words shorter than ${MIN_TOKEN_LENGTH} characters, and the server's stopwords, are not indexed.`,
        details: { documents: numeric(counted.rows[0]?.total) },
      }
    },
  }
}
