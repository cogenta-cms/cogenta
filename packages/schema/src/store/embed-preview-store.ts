import { createHash } from 'node:crypto'
import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { EMBED_PREVIEW_TABLE } from './embed-preview-tables.js'
import { valueList } from './fragments.js'

/**
 * The embed preview cache (L38) — see `embed-preview-tables.ts`.
 *
 * A failed resolution is stored too (`status: 'failed'`): without it, every
 * visit to a page holding a private or deleted video would ask the provider
 * again. The caller decides when a record is old enough to try again.
 */

export type EmbedPreviewStatus = 'ok' | 'failed'

export interface EmbedPreviewRecord {
  readonly url: string
  readonly provider: string
  readonly status: EmbedPreviewStatus
  readonly title: string | null
  readonly authorName: string | null
  /** The embedded player's own proportions, when the provider says. */
  readonly width: number | null
  readonly height: number | null
  /** A key in the site's storage driver, never a provider URL. */
  readonly thumbnailKey: string | null
  readonly thumbnailType: string | null
  readonly thumbnailWidth: number | null
  readonly thumbnailHeight: number | null
  readonly fetchedAt: string
}

export interface EmbedPreviewStore {
  get(url: string): Promise<EmbedPreviewRecord | null>
  /** Every cached record among `urls`, keyed by address; a miss is simply absent. */
  getMany(urls: readonly string[]): Promise<ReadonlyMap<string, EmbedPreviewRecord>>
  /** Looks a record up by the hash the thumbnail route carries. */
  byHash(hash: string): Promise<EmbedPreviewRecord | null>
  /** Inserts or replaces the record for `record.url`. */
  put(record: EmbedPreviewRecord): Promise<void>
}

/** The cache key of an address — also the name its thumbnail is served under. */
export function embedPreviewHash(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

interface Row {
  readonly url_hash: string
  readonly url: string
  readonly provider: string
  readonly status: string
  readonly title: string | null
  readonly author_name: string | null
  readonly width: number | string | null
  readonly height: number | string | null
  readonly thumbnail_key: string | null
  readonly thumbnail_type: string | null
  readonly thumbnail_width: number | string | null
  readonly thumbnail_height: number | string | null
  readonly fetched_at: string | Date
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toRecord(row: Row): EmbedPreviewRecord {
  return {
    url: row.url,
    provider: row.provider,
    status: row.status === 'ok' ? 'ok' : 'failed',
    title: row.title,
    authorName: row.author_name,
    width: toNumber(row.width),
    height: toNumber(row.height),
    thumbnailKey: row.thumbnail_key,
    thumbnailType: row.thumbnail_type,
    thumbnailWidth: toNumber(row.thumbnail_width),
    thumbnailHeight: toNumber(row.thumbnail_height),
    fetchedAt:
      row.fetched_at instanceof Date ? row.fetched_at.toISOString() : String(row.fetched_at),
  }
}

export function createEmbedPreviewStore(db: DatabaseHandle): EmbedPreviewStore {
  const dialect = db.dialect
  const table = identifier(EMBED_PREVIEW_TABLE, dialect)
  const hashColumn = identifier('url_hash', dialect)

  const byHash = async (hash: string): Promise<EmbedPreviewRecord | null> => {
    const found = await db.query<Row>(sql`select * from ${table} where ${hashColumn} = ${hash}`)
    const row = found.rows[0]
    return row === undefined ? null : toRecord(row)
  }

  return {
    get: (url) => byHash(embedPreviewHash(url)),
    byHash,

    async getMany(urls) {
      const result = new Map<string, EmbedPreviewRecord>()
      const unique = [...new Set(urls)]
      if (unique.length === 0) return result
      const hashes = unique.map(embedPreviewHash)
      const found = await db.query<Row>(
        sql`select * from ${table} where ${hashColumn} in (${valueList(hashes)})`,
      )
      for (const row of found.rows) result.set(row.url, toRecord(row))
      return result
    },

    async put(record) {
      const hash = embedPreviewHash(record.url)
      await db.transaction(async (tx) => {
        await tx.query(sql`delete from ${table} where ${hashColumn} = ${hash}`)
        await tx.query(sql`insert into ${table} (
          ${hashColumn}, ${identifier('url', dialect)}, ${identifier('provider', dialect)},
          ${identifier('status', dialect)}, ${identifier('title', dialect)},
          ${identifier('author_name', dialect)}, ${identifier('width', dialect)},
          ${identifier('height', dialect)}, ${identifier('thumbnail_key', dialect)},
          ${identifier('thumbnail_type', dialect)}, ${identifier('thumbnail_width', dialect)},
          ${identifier('thumbnail_height', dialect)}, ${identifier('fetched_at', dialect)}
        ) values (
          ${hash}, ${record.url}, ${record.provider}, ${record.status}, ${record.title},
          ${record.authorName}, ${record.width}, ${record.height}, ${record.thumbnailKey},
          ${record.thumbnailType}, ${record.thumbnailWidth}, ${record.thumbnailHeight},
          ${record.fetchedAt}
        )`)
      })
    },
  }
}
