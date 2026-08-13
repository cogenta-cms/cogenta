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
  SEARCH_FTS_TABLE,
  SEARCH_TABLE,
  scopeFilters,
  selectedColumns,
} from './table.js'
import { foldText } from './text.js'
import type { SearchDocument, SearchDriver, SearchQuery, SearchReference } from './types.js'

/**
 * SQLite full-text search: FTS5 when the runtime has it, `LIKE` when it does not.
 *
 * FTS5 is a compile-time option. `node:sqlite` ships with it enabled in the
 * official Node builds, but Cogenta also has to run on a distribution build, on
 * a shared host, and on whatever Node an ARM box happens to carry — and rule R1
 * says an infrastructure need must have an implementation that requires nothing.
 * So availability is *probed*, once, by trying to create the virtual table, and
 * a failure degrades to a substring scan instead of taking the site down.
 *
 * The degraded path is genuinely worse and says so in `health()`: no ranking, no
 * stemming, a full scan of the index table. It is not a silent fallback — an
 * administrator reading `cogenta doctor` sees which of the two is running.
 */

const SCOPE_INDEX = 'cogenta_search_scope'

/**
 * `"term"*` for every term, all required.
 *
 * The quotes turn each token into an FTS5 string literal, so even a token that
 * collided with a keyword (`AND`, `NEAR`, `NOT`) is read as a word. Tokens are
 * letters and digits only, so the closing quote can never be escaped out of.
 */
function matchExpression(tokens: readonly string[]): string {
  return tokens.map((token) => `"${token}"*`).join(' AND ')
}

export interface SqliteSearchOptions {
  readonly db: DatabaseHandle
  /**
   * Whether to use FTS5 when it is available.
   *
   * Defaults to true. Setting it to false forces the substring fallback, which
   * an operator may want on a build whose FTS5 is present but broken — and which
   * is how the contract suite proves the degraded path still honours the same
   * guarantees as the optimal one.
   */
  readonly fts5?: boolean
}

export async function createSqliteSearch(options: SqliteSearchOptions): Promise<SearchDriver> {
  const { db } = options
  const dialect = 'sqlite' as const
  const wanted = options.fts5 ?? true

  const fts = identifier(SEARCH_FTS_TABLE, dialect)
  const table = identifier(SEARCH_TABLE, dialect)
  const content = identifier(SEARCH_COLUMNS.content, dialect)
  const entryId = identifier(SEARCH_COLUMNS.entryId, dialect)
  const collection = identifier(SEARCH_COLUMNS.collection, dialect)

  const available = wanted && (await createFtsTable())
  const target = available ? fts : table

  if (!available) {
    await db.query(
      sql`create table if not exists ${table} (${joinFragments(
        [...baseColumns(dialect), primaryKey(dialect)],
        ', ',
      )})`,
    )
    await db.query(
      sql`create index if not exists ${identifier(SCOPE_INDEX, dialect)}
          on ${table} (${identifier(SEARCH_COLUMNS.locale, dialect)},
                       ${identifier(SEARCH_COLUMNS.status, dialect)})`,
    )
  }

  return {
    dialect,

    index: async (entry: SearchDocument): Promise<void> => {
      assertDocument(entry)
      const values = sql`(${entry.id}, ${entry.collection}, ${entry.locale}, ${entry.status},
                          ${storedTitle(entry)}, ${foldText(`${entry.title} ${entry.body}`)})`
      const columns = joinFragments(
        [
          entryId,
          collection,
          identifier(SEARCH_COLUMNS.locale, dialect),
          identifier(SEARCH_COLUMNS.status, dialect),
          identifier(SEARCH_COLUMNS.title, dialect),
          content,
        ],
        ', ',
      )

      if (!available) {
        // A primary key exists on the plain table, so one statement does it.
        await db.query(sql`insert or replace into ${table} (${columns}) values ${values}`)
        return
      }

      // An FTS5 table has no unique constraint to conflict on, so re-indexing is
      // a delete and an insert. Both inside one immediate transaction: a reader
      // that lands between them would otherwise find the entry missing from an
      // index that never stopped being complete.
      await db.transaction(
        async (tx) => {
          await tx.query(
            sql`delete from ${fts} where ${entryId} = ${entry.id} and ${collection} = ${entry.collection}`,
          )
          await tx.query(sql`insert into ${fts} (${columns}) values ${values}`)
        },
        { immediate: true },
      )
    },

    remove: async (reference: SearchReference): Promise<void> => {
      assertReference(reference)
      await db.query(
        sql`delete from ${target}
            where ${collection} = ${reference.collection} and ${entryId} = ${reference.id}`,
      )
    },

    search: async (query: SearchQuery) => {
      const normalised = normaliseQuery(query)
      if (normalised.tokens.length === 0) return EMPTY_RESULTS

      const filters = scopeFilters(dialect, normalised)

      if (!available) {
        // No ranking to offer, so none is invented: every hit scores zero and
        // the order is the stable one. A caller that sorted on `score` would
        // otherwise believe a substring scan had an opinion about relevance.
        const like = normalised.tokens.map((token) => sql`${content} like ${`%${token}%`}`)

        const scanned = await db.query<Record<string, unknown>>(
          sql`select ${selectedColumns(dialect)}
              from ${table}
              where ${allOf([...like, ...filters])}
              order by ${entryId} asc
              limit ${sqlLimit(normalised.size + 1)} offset ${sqlLimit(normalised.offset)}`,
        )

        return toResults(scanned.rows, () => 0, normalised)
      }

      // bm25() returns a negative number, best first. Negating it makes `score`
      // mean the same thing here as on the other two dialects: higher is better.
      const score = sql`-bm25(${fts})`
      const found = await db.query<Record<string, unknown>>(
        sql`select ${selectedColumns(dialect)}, ${score} as ${identifier('score', dialect)}
            from ${fts}
            where ${allOf([sql`${fts} match ${matchExpression(normalised.tokens)}`, ...filters])}
            order by ${identifier('score', dialect)} desc, ${entryId} asc
            limit ${sqlLimit(normalised.size + 1)} offset ${sqlLimit(normalised.offset)}`,
      )

      return toResults(found.rows, (row) => numeric(row['score']), normalised)
    },

    clear: async (scope) => {
      const where =
        scope?.collection === undefined ? sql`` : sql` where ${collection} = ${scope.collection}`
      await db.query(sql`delete from ${target}${where}`)
    },

    health: async (): Promise<HealthReport> => {
      const started = Date.now()
      const counted = await db.query<{ total: unknown }>(
        sql`select count(*) as ${identifier('total', dialect)} from ${target}`,
      )
      const documents = numeric(counted.rows[0]?.total)

      if (available) {
        return {
          status: 'ok',
          driver: 'sqlite',
          tier: 'degraded',
          latencyMs: Date.now() - started,
          message: 'Full-text search on an FTS5 table, ranked with BM25.',
          details: { documents, engine: 'fts5' },
        }
      }

      return {
        status: 'degraded',
        driver: 'sqlite',
        tier: 'degraded',
        latencyMs: Date.now() - started,
        message: wanted
          ? 'This SQLite build has no FTS5, so search falls back to a substring scan: no ranking, no stemming, and it slows down as the site grows. Rebuild Node with FTS5, or move to Postgres or MySQL.'
          : 'FTS5 is turned off, so search falls back to a substring scan: no ranking and no stemming.',
        details: { documents, engine: 'like' },
      }
    },
  }

  /**
   * Probes FTS5 by trying to use it.
   *
   * Reading `pragma compile_options` would be the obvious test and is the wrong
   * one: it reports how the library was built, not whether this connection can
   * create the module — a distribution can ship FTS5 disabled at runtime. The
   * statement that would fail later is the honest probe.
   */
  async function createFtsTable(): Promise<boolean> {
    const columns: SqlFragment[] = [
      // Only `content` is indexed. The rest are stored so a hit needs no join,
      // but tokenising an id or a status would pollute every ranking.
      sql`${entryId} unindexed`,
      sql`${collection} unindexed`,
      sql`${identifier(SEARCH_COLUMNS.locale, dialect)} unindexed`,
      sql`${identifier(SEARCH_COLUMNS.status, dialect)} unindexed`,
      sql`${identifier(SEARCH_COLUMNS.title, dialect)} unindexed`,
      content,
    ]

    try {
      await db.query(
        sql`create virtual table if not exists ${fts} using fts5(${joinFragments(columns, ', ')})`,
      )
      return true
    } catch {
      return false
    }
  }
}
