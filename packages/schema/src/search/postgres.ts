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
import { foldText } from './text.js'
import type { SearchDocument, SearchDriver, SearchQuery, SearchReference } from './types.js'

/**
 * Postgres full-text search: a stored `tsvector` and a GIN index.
 *
 * The vector is a real column rather than an expression index, because the
 * text search configuration is **per row**: an entry in French must be stemmed
 * by the French dictionary and an entry in English by the English one, and an
 * expression index can only name one configuration. Storing the vector costs
 * space and buys the right stemmer per language, which is the whole reason to
 * be on Postgres for this feature.
 */

const DOCUMENT_COLUMN = 'document'
const GIN_INDEX = 'cogenta_search_document_gin'
const SCOPE_INDEX = 'cogenta_search_scope'

/**
 * Locale to text search configuration.
 *
 * Only configurations that ship with a default Postgres build are listed: a
 * missing one is not a warning but a `text search configuration "…" does not
 * exist` at query time. Anything unlisted falls back to `simple`, which does no
 * stemming and no stopword removal — worse recall, never an error, which is the
 * right trade for a language the server was not built to handle.
 */
const CONFIGURATIONS: Readonly<Record<string, string>> = {
  ar: 'arabic',
  da: 'danish',
  de: 'german',
  el: 'greek',
  en: 'english',
  es: 'spanish',
  eu: 'basque',
  fi: 'finnish',
  fr: 'french',
  ga: 'irish',
  hi: 'hindi',
  hu: 'hungarian',
  hy: 'armenian',
  id: 'indonesian',
  it: 'italian',
  lt: 'lithuanian',
  ne: 'nepali',
  nl: 'dutch',
  no: 'norwegian',
  pt: 'portuguese',
  ro: 'romanian',
  ru: 'russian',
  sr: 'serbian',
  sv: 'swedish',
  ta: 'tamil',
  tr: 'turkish',
  yi: 'yiddish',
}

/** `fr-CA`, `fr_CA` and `FR` all mean the French dictionary. */
export function configurationFor(locale: string): string {
  const primary = locale.toLowerCase().split(/[-_]/u)[0] ?? ''
  return CONFIGURATIONS[primary] ?? 'simple'
}

/**
 * The `tsquery` text: every term required, every term a prefix.
 *
 * Requiring all terms (`&`) rather than any of them matches what a reader
 * expects of a site search — more terms should narrow, not widen. The `:*`
 * makes a half-typed last word still match, which is what a search-as-you-type
 * box needs. Tokens are letters and digits only (see `text.ts`), so nothing in
 * here can be read as `tsquery` syntax.
 */
function tsquery(tokens: readonly string[]): string {
  return tokens.map((token) => `${token}:*`).join(' & ')
}

export interface PostgresSearchOptions {
  readonly db: DatabaseHandle
}

export async function createPostgresSearch(options: PostgresSearchOptions): Promise<SearchDriver> {
  const { db } = options
  const dialect = 'postgres' as const
  const table = identifier(SEARCH_TABLE, dialect)
  const document = identifier(DOCUMENT_COLUMN, dialect)

  const columns: SqlFragment[] = [
    ...baseColumns(dialect),
    sql`${document} tsvector not null`,
    primaryKey(dialect),
  ]

  await db.query(sql`create table if not exists ${table} (${joinFragments(columns, ', ')})`)
  // GIN rather than GiST: slower to update, far faster to search, and a content
  // index is read orders of magnitude more often than it is written.
  await db.query(
    sql`create index if not exists ${identifier(GIN_INDEX, dialect)}
        on ${table} using gin (${document})`,
  )
  await db.query(
    sql`create index if not exists ${identifier(SCOPE_INDEX, dialect)}
        on ${table} (${identifier(SEARCH_COLUMNS.locale, dialect)},
                     ${identifier(SEARCH_COLUMNS.status, dialect)})`,
  )

  return {
    dialect,

    index: async (entry: SearchDocument): Promise<void> => {
      assertDocument(entry)
      const configuration = configurationFor(entry.locale)
      const content = foldText(`${entry.title} ${entry.body}`)

      // `on conflict` rather than delete-then-insert: re-indexing an entry after
      // an edit is the common path, and two statements would leave the entry
      // missing from the index for the instant between them.
      await db.query(
        sql`insert into ${table} (
              ${identifier(SEARCH_COLUMNS.entryId, dialect)},
              ${identifier(SEARCH_COLUMNS.collection, dialect)},
              ${identifier(SEARCH_COLUMNS.locale, dialect)},
              ${identifier(SEARCH_COLUMNS.status, dialect)},
              ${identifier(SEARCH_COLUMNS.title, dialect)},
              ${identifier(SEARCH_COLUMNS.content, dialect)},
              ${document})
            values (${entry.id}, ${entry.collection}, ${entry.locale}, ${entry.status},
                    ${storedTitle(entry)}, ${content},
                    to_tsvector(${configuration}::regconfig, ${content}))
            on conflict (${identifier(SEARCH_COLUMNS.collection, dialect)},
                         ${identifier(SEARCH_COLUMNS.entryId, dialect)})
            do update set
              ${identifier(SEARCH_COLUMNS.locale, dialect)} = excluded.${identifier(SEARCH_COLUMNS.locale, dialect)},
              ${identifier(SEARCH_COLUMNS.status, dialect)} = excluded.${identifier(SEARCH_COLUMNS.status, dialect)},
              ${identifier(SEARCH_COLUMNS.title, dialect)} = excluded.${identifier(SEARCH_COLUMNS.title, dialect)},
              ${identifier(SEARCH_COLUMNS.content, dialect)} = excluded.${identifier(SEARCH_COLUMNS.content, dialect)},
              ${document} = excluded.${document}`,
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

      const configuration = configurationFor(normalised.locale)
      const expression = tsquery(normalised.tokens)
      const filters = scopeFilters(dialect, normalised)

      // The query is built twice — once to match, once to rank. Postgres
      // evaluates `to_tsquery` as an immutable function, so this is one parse
      // and no extra work, and it keeps the statement readable.
      const match = sql`${document} @@ to_tsquery(${configuration}::regconfig, ${expression})`
      const rank = sql`ts_rank(${document}, to_tsquery(${configuration}::regconfig, ${expression}))`

      const found = await db.query<Record<string, unknown>>(
        sql`select ${selectedColumns(dialect)}, ${rank} as ${identifier('score', dialect)}
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
        driver: 'postgres',
        tier: 'optimal',
        latencyMs: Date.now() - started,
        message: 'Full-text search on tsvector with a GIN index, stemmed per locale.',
        details: { documents: numeric(counted.rows[0]?.total) },
      }
    },
  }
}
