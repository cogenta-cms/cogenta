import {
  CogentaError,
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'
import type { DocumentFormat } from '../../documents/extract-text.js'
import type { ReferenceDocumentRecord, ReferenceDocumentStatus } from './types.js'

/**
 * Metadata for every reference document a site has uploaded — L22 task 4's
 * "état clair de ce qui est indexé/en cours/en erreur". The vector store
 * (`VectorStore`) holds the embedded chunks; this table holds the one row
 * per upload that the admin screen actually renders a list from, because a
 * `VectorStore` has no notion of "a document", only of chunks that happen to
 * share an `entryId`.
 *
 * Column helpers are written out by hand rather than imported from
 * `@cogenta/schema`'s `store/columns.ts`: that module is not part of
 * `@cogenta/schema`'s public `exports` map (only `.` is), and `@cogenta/agents`
 * may not deep-import another package's `src/`. Three columns' worth of
 * per-dialect typing is not worth widening that package's public surface for.
 */

const REFERENCE_DOCUMENTS_TABLE = 'cogenta_reference_documents'

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

function idColumn(dialect: DatabaseDialect): SqlFragment {
  if (dialect === 'postgres') return unsafeRaw('uuid')
  if (dialect === 'mysql') return unsafeRaw('char(36)')
  return unsafeRaw('text')
}

function timestampColumn(dialect: DatabaseDialect): SqlFragment {
  return textColumn(dialect, 32)
}

function integerColumn(): SqlFragment {
  return unsafeRaw('integer')
}

interface Row {
  readonly id: string
  readonly site_id: string
  readonly filename: string
  readonly format: string
  readonly characters: number
  readonly chunk_count: number
  readonly status: string
  readonly error_message: string | null
  readonly warnings: string
  readonly uploaded_at: string
  readonly uploaded_by: string | null
  readonly indexed_at: string | null
}

function toRecord(row: Row): ReferenceDocumentRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    filename: row.filename,
    format: row.format as DocumentFormat,
    characters: Number(row.characters),
    chunkCount: Number(row.chunk_count),
    status: row.status as ReferenceDocumentStatus,
    errorMessage: row.error_message,
    warnings: JSON.parse(row.warnings) as readonly string[],
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    indexedAt: row.indexed_at,
  }
}

export interface CreateReferenceDocumentInput {
  readonly siteId: string
  readonly filename: string
  readonly format: DocumentFormat
  readonly characters: number
  readonly warnings: readonly string[]
  readonly uploadedBy: string | null
}

export interface ReferenceDocumentStore {
  ensureTable(): Promise<void>
  list(siteId: string): Promise<readonly ReferenceDocumentRecord[]>
  get(siteId: string, id: string): Promise<ReferenceDocumentRecord | null>
  /** Inserted with `status: 'pending'` — indexing (embedding + vector upsert) happens after, and reports back via `markIndexed`/`markError`. */
  create(input: CreateReferenceDocumentInput): Promise<ReferenceDocumentRecord>
  markIndexed(siteId: string, id: string, chunkCount: number, at: string): Promise<void>
  markError(siteId: string, id: string, message: string): Promise<void>
  remove(siteId: string, id: string): Promise<void>
}

function notFound(id: string): CogentaError {
  return new CogentaError({
    code: 'ASSIST_DOCUMENT_NOT_FOUND',
    message: `No reference document "${id}" exists on this site.`,
    hint: 'Check the id against GET /api/assistant/documents — it may already have been removed.',
    details: { id },
  })
}

export function createReferenceDocumentStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): ReferenceDocumentStore {
  const d = db.dialect
  const table = identifier(REFERENCE_DOCUMENTS_TABLE, d)

  return {
    async ensureTable() {
      await db.query(sql`
        create table if not exists ${table} (
          id ${idColumn(d)} not null primary key,
          site_id ${textColumn(d, 500)} not null,
          filename ${textColumn(d, 300)} not null,
          format ${textColumn(d, 16)} not null,
          characters ${integerColumn()} not null,
          chunk_count ${integerColumn()} not null,
          status ${textColumn(d, 16)} not null,
          error_message ${textColumn(d, 2000)},
          warnings ${textColumn(d, 4000)} not null,
          uploaded_at ${timestampColumn(d)} not null,
          uploaded_by ${idColumn(d)},
          indexed_at ${timestampColumn(d)}
        )`)
    },

    async list(siteId) {
      // `id` (UUIDv7) breaks a tie on `uploaded_at` in the same direction —
      // two uploads landing in the same millisecond still sort newest first,
      // deterministically, rather than by whatever order SQLite feels like.
      const result = await db.query<Row>(sql`
        select * from ${table} where site_id = ${siteId} order by uploaded_at desc, id desc`)
      return result.rows.map(toRecord)
    },

    async get(siteId, id) {
      const result = await db.query<Row>(sql`
        select * from ${table} where site_id = ${siteId} and id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : toRecord(row)
    },

    async create(input) {
      const id = newId(now)
      const uploadedAt = new Date(now()).toISOString()
      await db.query(sql`
        insert into ${table}
          (id, site_id, filename, format, characters, chunk_count, status,
           error_message, warnings, uploaded_at, uploaded_by, indexed_at)
        values (
          ${id}, ${input.siteId}, ${input.filename}, ${input.format}, ${input.characters}, 0,
          ${'pending'}, ${null}, ${JSON.stringify([...input.warnings])}, ${uploadedAt},
          ${input.uploadedBy}, ${null}
        )`)
      return {
        id,
        siteId: input.siteId,
        filename: input.filename,
        format: input.format,
        characters: input.characters,
        chunkCount: 0,
        status: 'pending',
        errorMessage: null,
        warnings: input.warnings,
        uploadedAt,
        uploadedBy: input.uploadedBy,
        indexedAt: null,
      }
    },

    async markIndexed(siteId, id, chunkCount, at) {
      await db.query(sql`
        update ${table}
        set status = ${'indexed'}, chunk_count = ${chunkCount}, error_message = ${null}, indexed_at = ${at}
        where site_id = ${siteId} and id = ${id}`)
    },

    async markError(siteId, id, message) {
      await db.query(sql`
        update ${table}
        set status = ${'error'}, error_message = ${message}
        where site_id = ${siteId} and id = ${id}`)
    },

    async remove(siteId, id) {
      const existing = await db.query<Row>(sql`
        select id from ${table} where site_id = ${siteId} and id = ${id}`)
      if (existing.rows.length === 0) throw notFound(id)
      await db.query(sql`delete from ${table} where site_id = ${siteId} and id = ${id}`)
    },
  }
}
