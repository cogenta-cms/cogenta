import {
  CogentaError,
  type DatabaseHandle,
  type Driver,
  type HealthReport,
  identifier,
  type SqlFragment,
  sql,
  limit as sqlLimit,
  unsafeRaw,
} from '@cogenta/core'
import {
  VECTOR_DEFAULTS,
  type VectorConfig,
  type VectorFilter,
  type VectorMatch,
  type VectorRecord,
  type VectorSearchOptions,
  type VectorStore,
} from './types.js'

const DEFAULT_TABLE = 'cogenta_vectors'

export interface PgVectorOptions {
  readonly db: DatabaseHandle
  readonly dimensions: number
  readonly table?: string
}

interface Row {
  readonly chunk_id: string
  readonly site_id: string
  readonly collection: string
  readonly entry_id: string
  readonly locale: string
  readonly status: string
  readonly document_id: string
  readonly block_ids: string
  readonly chunk_text: string
  readonly chunk_hash: string
  readonly score: number
}

/**
 * A pgvector literal.
 *
 * Bound as a parameter and cast in SQL (`$1::vector`), never interpolated: the
 * numbers come from an embedding provider, which is code, but "it came from code
 * this time" is not a property that survives a refactor. Non-finite values are
 * refused rather than serialised — `NaN` in a vector column silently poisons
 * every distance it takes part in.
 */
export function vectorLiteral(vector: readonly number[]): string {
  for (const value of vector) {
    if (!Number.isFinite(value)) {
      throw new CogentaError({
        code: 'VECTOR_DIMENSION_MISMATCH',
        message: 'An embedding contains a value that is not a finite number.',
        hint: 'The embedding provider returned NaN or Infinity — re-embed the text, and check the provider response.',
      })
    }
  }
  return `[${vector.join(',')}]`
}

function whereFrom(filter: VectorFilter | undefined): SqlFragment {
  if (filter === undefined) return sql`true`
  const clauses: SqlFragment[] = [sql`true`]
  if (filter.siteId !== undefined) clauses.push(sql`site_id = ${filter.siteId}`)
  if (filter.collections !== undefined) {
    clauses.push(
      filter.collections.length === 0
        ? sql`false`
        : sql`collection = any(${asTextArray(filter.collections)})`,
    )
  }
  if (filter.locales !== undefined) {
    clauses.push(
      filter.locales.length === 0 ? sql`false` : sql`locale = any(${asTextArray(filter.locales)})`,
    )
  }
  if (filter.statuses !== undefined) {
    clauses.push(
      filter.statuses.length === 0
        ? sql`false`
        : sql`status = any(${asTextArray(filter.statuses)})`,
    )
  }
  if (filter.excludeEntryIds !== undefined && filter.excludeEntryIds.length > 0) {
    clauses.push(sql`not (entry_id = any(${asTextArray(filter.excludeEntryIds)}))`)
  }

  let combined = clauses[0] ?? sql`true`
  for (const clause of clauses.slice(1)) combined = sql`${combined} and ${clause}`
  return combined
}

/**
 * `text[]` for `= any(…)`.
 *
 * `encodeValue` turns any array into JSON text, which Postgres will not accept
 * as an array, so the values are bound one by one into an `array[…]`
 * constructor instead. Still bound — no value ever reaches the SQL text.
 */
function asTextArray(values: readonly string[]): SqlFragment {
  let inner = sql`${values[0] ?? ''}::text`
  for (const value of values.slice(1)) inner = sql`${inner}, ${value}::text`
  return sql`array[${inner}]`
}

/**
 * The optimal tier for the `vector` need — the row `docs/02-architecture.md`
 * already named ("pgvector") and nothing implemented until L18.
 *
 * Distance is cosine (`<=>`), and the score handed back is `1 - distance`, so
 * it is the same cosine similarity the memory and file drivers return: the
 * shared contract suite compares the *same* numbers across all three, which is
 * the only way "swap the driver, change nothing else" is a claim rather than a
 * hope.
 */
export async function createPgVectorStore(options: PgVectorOptions): Promise<VectorStore> {
  const { db, dimensions } = options
  const table = options.table ?? DEFAULT_TABLE

  if (db.dialect !== 'postgres') {
    throw new CogentaError({
      code: 'DB_DIALECT_UNSUPPORTED',
      message: `The pgvector store needs Postgres and this site is on ${db.dialect}.`,
      hint: 'Use the file or memory vector driver, or move the site to Postgres with the pgvector extension.',
      details: { dialect: db.dialect },
    })
  }

  const name = identifier(table, 'postgres')

  await db.query(sql`create extension if not exists vector`)
  await db.query(sql`
    create table if not exists ${name} (
      chunk_id text primary key,
      site_id text not null,
      collection text not null,
      entry_id text not null,
      locale text not null,
      status text not null,
      document_id text not null,
      block_ids text not null,
      chunk_text text not null,
      chunk_hash text not null,
      embedding vector(${unsafeRaw(String(Math.trunc(dimensions)))}) not null
    )
  `)
  await db.query(sql`
    create index if not exists ${identifier(`${table}_scope`, 'postgres')}
      on ${name} (site_id, collection, entry_id)
  `)

  function assertDimensions(record: VectorRecord): void {
    if (record.vector.length === dimensions) return
    throw new CogentaError({
      code: 'VECTOR_DIMENSION_MISMATCH',
      message: `This store holds ${dimensions}-dimension vectors and was handed one of ${record.vector.length}.`,
      hint: 'Changing embedding model means a new, parallel index — never mixing two models in one store. Re-index from scratch after a model change.',
      details: { expected: dimensions, received: record.vector.length, chunkId: record.chunk.id },
    })
  }

  function toRecord(row: Row): VectorRecord {
    return {
      siteId: row.site_id,
      collection: row.collection,
      entryId: row.entry_id,
      locale: row.locale,
      status: row.status,
      chunk: {
        id: row.chunk_id,
        documentId: row.document_id,
        blockIds: JSON.parse(row.block_ids) as readonly string[],
        text: row.chunk_text,
        hash: row.chunk_hash,
      },
      // Not selected: a search result is used for its text and its score, and
      // pulling every embedding back over the wire to hand it to a caller that
      // discards it is pure cost. `upsert` is the only thing that needs the
      // numbers, and it already has them.
      vector: [],
    }
  }

  return {
    dimensions,

    async upsert(records) {
      for (const record of records) assertDimensions(record)
      if (records.length === 0) return
      await db.transaction(async (tx) => {
        for (const record of records) {
          await tx.query(sql`
            insert into ${name}
              (chunk_id, site_id, collection, entry_id, locale, status,
               document_id, block_ids, chunk_text, chunk_hash, embedding)
            values (
              ${record.chunk.id}, ${record.siteId}, ${record.collection}, ${record.entryId},
              ${record.locale}, ${record.status}, ${record.chunk.documentId},
              ${JSON.stringify([...record.chunk.blockIds])}, ${record.chunk.text},
              ${record.chunk.hash}, ${vectorLiteral([...record.vector])}::vector
            )
            on conflict (chunk_id) do update set
              site_id = excluded.site_id,
              collection = excluded.collection,
              entry_id = excluded.entry_id,
              locale = excluded.locale,
              status = excluded.status,
              document_id = excluded.document_id,
              block_ids = excluded.block_ids,
              chunk_text = excluded.chunk_text,
              chunk_hash = excluded.chunk_hash,
              embedding = excluded.embedding
          `)
        }
      })
    },

    async remove(chunkIds) {
      if (chunkIds.length === 0) return
      await db.query(sql`delete from ${name} where chunk_id = any(${asTextArray([...chunkIds])})`)
    },

    async removeEntries(scope) {
      if (scope.entryIds.length === 0) return
      await db.query(sql`
        delete from ${name}
        where site_id = ${scope.siteId}
          and collection = ${scope.collection}
          and entry_id = any(${asTextArray([...scope.entryIds])})
      `)
    },

    async search(queryVector, searchOptions?: VectorSearchOptions) {
      const count = searchOptions?.limit ?? VECTOR_DEFAULTS.limit
      const literal = vectorLiteral([...queryVector])
      const result = await db.query<Row>(sql`
        select chunk_id, site_id, collection, entry_id, locale, status,
               document_id, block_ids, chunk_text, chunk_hash,
               1 - (embedding <=> ${literal}::vector) as score
        from ${name}
        where ${whereFrom(searchOptions?.filter)}
        order by embedding <=> ${literal}::vector
        limit ${sqlLimit(count)}
      `)

      const minScore = searchOptions?.minScore
      const matches: VectorMatch[] = []
      for (const row of result.rows) {
        const score = Number(row.score)
        // The memory driver drops a zero or negative similarity; matching that
        // here is what keeps the contract suite's expectations identical.
        if (score <= 0) continue
        if (minScore !== undefined && score < minScore) continue
        matches.push({ record: toRecord(row), score })
      }
      return matches
    },

    async count(filter?: VectorFilter) {
      const result = await db.query<{ readonly total: string | number }>(
        sql`select count(*) as total from ${name} where ${whereFrom(filter)}`,
      )
      return Number(result.rows[0]?.total ?? 0)
    },

    async clear() {
      await db.query(sql`delete from ${name}`)
    },
  }
}

export interface PgVectorDriverOptions {
  /** Absent means "this site has no database handle to lend", and the driver simply is not available. */
  readonly db?: DatabaseHandle
}

export function pgVectorDriver(
  options: PgVectorDriverOptions = {},
): Driver<VectorStore, VectorConfig> {
  let store: VectorStore | null = null

  return {
    name: 'pgvector',
    tier: 'optimal',
    available: async () => {
      const db = options.db
      if (db === undefined || db.dialect !== 'postgres') return false
      // "Does the service actually answer?", not "is a URL configured?" — the
      // extension has to be installable, which on a managed Postgres it may
      // well not be, and finding that out at `create table` time would be a
      // startup crash instead of a fallback.
      try {
        await db.query(sql`create extension if not exists vector`)
        return true
      } catch {
        return false
      }
    },
    init: async (config) => {
      const db = options.db
      if (db === undefined) {
        throw new CogentaError({
          code: 'DRIVER_INIT_FAILED',
          message: 'The pgvector driver was selected without a database handle.',
          hint: 'Pass the site database to pgVectorDriver({ db }) when building the vector registry.',
        })
      }
      store = await createPgVectorStore({
        db,
        dimensions: config.dimensions,
        ...(config.table === undefined ? {} : { table: config.table }),
      })
      return store
    },
    dispose: async () => {
      // The handle belongs to the site, not to this driver: closing it here
      // would take the whole CMS down with the vector index.
      store = null
    },
    health: async (): Promise<HealthReport> => ({
      status: 'ok',
      driver: 'pgvector',
      tier: 'optimal',
      message: 'Embeddings are stored in Postgres with the pgvector extension.',
      ...(store === null ? {} : { details: { records: await store.count() } }),
    }),
  }
}
