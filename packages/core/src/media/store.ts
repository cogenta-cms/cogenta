import { createHash, randomUUID } from 'node:crypto'
import { type DatabaseHandle, identifier, limit, sql } from '../db/index.js'
import { CogentaError } from '../errors/index.js'
import type {
  CreateMediaInput,
  FocalPoint,
  ListMediaOptions,
  MediaAsset,
  MediaPage,
  MediaSortField,
  MediaStore,
  ReplaceMediaInput,
  UpdateMediaInput,
} from './types.js'

const TABLE = 'cogenta_media'
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * Tags are stored as one delimited text column rather than a join table or a
 * dialect's own JSON type: SQLite, Postgres and MySQL disagree on JSON
 * containment operators (`@>`, `JSON_CONTAINS`, `json_each`), and a
 * materialised-path-style delimited string (the same portability trade
 * ADR-0006 already made for taxonomies) turns "has this tag" into one `LIKE`
 * every dialect answers identically. `\u0001` rather than a comma: a tag is
 * free text an editor typed, and a comma is a character they might type too.
 */
const TAG_DELIMITER = '\u0001'

export interface DatabaseMediaStoreOptions {
  readonly db: DatabaseHandle
}

interface MediaRow {
  id: string
  kind: string
  filename: string
  mime_type: string
  size: number
  width: number | null
  height: number | null
  alt: string
  decorative: boolean | number
  decorative_justification: string | null
  focal: string | null
  storage_key: string
  tags: string | null
  content_hash: string | null
  created_at: string
  created_by: string | null
}

/** Every caller that predates tagging/replace still gets a stable, non-empty value. */
function defaultContentHash(storageKey: string): string {
  return createHash('sha256').update(storageKey).digest('hex').slice(0, 16)
}

function serializeTags(tags: readonly string[]): string {
  const cleaned = tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)
  if (cleaned.length === 0) return ''
  return `${TAG_DELIMITER}${cleaned.join(TAG_DELIMITER)}${TAG_DELIMITER}`
}

function parseTags(raw: string | null): readonly string[] {
  if (raw === null || raw.length === 0) return []
  return raw.split(TAG_DELIMITER).filter((tag) => tag.length > 0)
}

/** Escapes `\`, `%` and `_` so a tag containing them cannot widen its own `LIKE` filter. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (char) => `\\${char}`)
}

function rowToAsset(row: MediaRow): MediaAsset {
  return {
    id: row.id,
    kind: row.kind as MediaAsset['kind'],
    filename: row.filename,
    mimeType: row.mime_type,
    size: Number(row.size),
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    alt: row.alt,
    decorative: row.decorative === true || row.decorative === 1,
    decorativeJustification: row.decorative_justification,
    focal: row.focal === null ? null : (JSON.parse(row.focal) as FocalPoint),
    storageKey: row.storage_key,
    tags: parseTags(row.tags),
    contentHash:
      row.content_hash === null || row.content_hash === ''
        ? defaultContentHash(row.storage_key)
        : row.content_hash,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }
}

function notFound(id: string): CogentaError {
  return new CogentaError({
    code: 'MEDIA_NOT_FOUND',
    message: `No media asset with id "${id}".`,
    hint: 'List media to find a valid id, or the asset may already have been deleted.',
    details: { id },
  })
}

/**
 * A decorative asset carries no description (L2-admin.md's own rule: the
 * decorative checkbox writes `alt=""`), and needs a reason a reviewer can
 * read instead — an editor who cannot explain why an image is decorative is
 * usually one who meant to write alt text and skipped it by accident.
 */
function validateAltPolicy(alt: string, decorative: boolean, justification: string | null): void {
  if (decorative) {
    if (justification === null || justification.trim().length === 0) {
      throw new CogentaError({
        code: 'MEDIA_INVALID',
        message: 'A decorative image needs a justification.',
        hint: 'Say why the image carries no information a screen reader needs to announce.',
      })
    }
    return
  }
  if (alt.trim().length === 0) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: 'Alt text is required unless the image is marked decorative.',
      hint: 'Describe what the image shows, or mark it decorative with a justification.',
    })
  }
}

const SORT_COLUMNS: Readonly<Record<MediaSortField, string>> = {
  createdAt: 'created_at',
  filename: 'filename',
  size: 'size',
}

/** The cursor value in the *comparable* JS type for its column — a string for text columns, a number for the numeric `size` column. */
function sortValueOf(field: MediaSortField, row: MediaRow): string | number {
  if (field === 'size') return Number(row.size)
  if (field === 'filename') return row.filename
  return row.created_at
}

function encodeCursor(field: MediaSortField, value: string | number, id: string): string {
  return Buffer.from(`${field}|${String(value)}|${id}`, 'utf8').toString('base64url')
}

function decodeCursor(
  field: MediaSortField,
  cursor: string,
): { readonly value: string | number; readonly id: string } | null {
  try {
    const [cursorField, rawValue, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    if (cursorField !== field || rawValue === undefined || id === undefined) return null
    return { value: field === 'size' ? Number(rawValue) : rawValue, id }
  } catch {
    return null
  }
}

/**
 * The media asset store: one SQL table, played against SQLite, Postgres and
 * MySQL by the same contract — the same shape as the degraded job queue
 * (`../queue/database.ts`), since a media library has no infrastructure
 * dependency to fall back from in the first place (rule R1).
 */
export function createDatabaseMediaStore(options: DatabaseMediaStoreOptions): MediaStore {
  const { db } = options
  const table = identifier(TABLE, db.dialect)
  let ready = false

  async function ensureTable(): Promise<void> {
    if (ready) return
    await db.query(sql`
      create table if not exists ${table} (
        id varchar(64) not null primary key,
        kind varchar(16) not null,
        filename varchar(512) not null,
        mime_type varchar(255) not null,
        size bigint not null,
        width integer,
        height integer,
        alt text not null,
        decorative boolean not null,
        decorative_justification text,
        focal text,
        storage_key varchar(1024) not null,
        created_at varchar(32) not null,
        created_by varchar(255)
      )`)

    await db
      .query(
        sql`create index ${identifier('cogenta_media_created', db.dialect)}
            on ${table} (created_at, id)`,
      )
      .catch(() => undefined) // already there

    // Fiche 11: tags and a replace-tracking content hash, added to a table
    // sites may already have (L2/L10). No portable "add column if not
    // exists" across all three dialects (SQLite has none at all), so — the
    // same pattern `@cogenta/auth`'s `tables.ts` uses for its own
    // after-the-fact columns — this is a `try`, not a check.
    await db
      .query(sql`alter table ${table} add column ${identifier('tags', db.dialect)} text`)
      .catch(() => undefined)
    await db
      .query(
        sql`alter table ${table} add column ${identifier('content_hash', db.dialect)} varchar(64)`,
      )
      .catch(() => undefined)
    await db
      .query(
        sql`create index ${identifier('cogenta_media_filename', db.dialect)}
            on ${table} (filename, id)`,
      )
      .catch(() => undefined)
    await db
      .query(
        sql`create index ${identifier('cogenta_media_size', db.dialect)}
            on ${table} (size, id)`,
      )
      .catch(() => undefined)

    ready = true
  }

  function filtersFor(listOptions: {
    readonly kind?: ListMediaOptions['kind']
    readonly tag?: string
    readonly from?: string
    readonly to?: string
  }) {
    const kindFilter = listOptions.kind === undefined ? sql`` : sql`and kind = ${listOptions.kind}`
    const tagFilter =
      listOptions.tag === undefined || listOptions.tag.trim().length === 0
        ? sql``
        : sql`and tags like ${`%${TAG_DELIMITER}${escapeLikePattern(listOptions.tag.trim())}${TAG_DELIMITER}%`} escape '\\'`
    const fromFilter =
      listOptions.from === undefined ? sql`` : sql`and created_at >= ${listOptions.from}`
    const toFilter = listOptions.to === undefined ? sql`` : sql`and created_at <= ${listOptions.to}`
    return sql`${kindFilter} ${tagFilter} ${fromFilter} ${toFilter}`
  }

  return {
    create: async (input: CreateMediaInput): Promise<MediaAsset> => {
      await ensureTable()

      const decorative = input.decorative ?? false
      const alt = decorative ? '' : input.alt
      const justification = decorative ? (input.decorativeJustification ?? null) : null
      validateAltPolicy(alt, decorative, justification)

      const id = input.id ?? randomUUID()
      const createdAt = new Date().toISOString()
      const tags = input.tags ?? []
      const contentHash = input.contentHash ?? defaultContentHash(input.storageKey)

      await db.query(sql`
        insert into ${table}
          (id, kind, filename, mime_type, size, width, height, alt, decorative,
           decorative_justification, focal, storage_key, tags, content_hash, created_at, created_by)
        values
          (${id}, ${input.kind}, ${input.filename}, ${input.mimeType}, ${input.size},
           ${input.width ?? null}, ${input.height ?? null}, ${alt}, ${decorative},
           ${justification}, ${input.focal === undefined || input.focal === null ? null : JSON.stringify(input.focal)},
           ${input.storageKey}, ${serializeTags(tags)}, ${contentHash}, ${createdAt}, ${input.createdBy ?? null})`)

      return {
        id,
        kind: input.kind,
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.size,
        width: input.width ?? null,
        height: input.height ?? null,
        alt,
        decorative,
        decorativeJustification: justification,
        focal: input.focal ?? null,
        storageKey: input.storageKey,
        tags,
        contentHash,
        createdAt,
        createdBy: input.createdBy ?? null,
      }
    },

    get: async (id: string): Promise<MediaAsset | null> => {
      await ensureTable()
      const result = await db.query<MediaRow>(sql`select * from ${table} where id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : rowToAsset(row)
    },

    list: async (listOptions: ListMediaOptions = {}): Promise<MediaPage> => {
      await ensureTable()

      const pageSize = Math.min(listOptions.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
      const sortField = listOptions.sort ?? 'createdAt'
      const direction = listOptions.direction ?? 'desc'
      const sortColumn = identifier(SORT_COLUMNS[sortField], db.dialect)
      const cmp = direction === 'desc' ? sql`<` : sql`>`
      const order = direction === 'desc' ? sql`desc` : sql`asc`

      const cursor =
        listOptions.cursor === undefined ? null : decodeCursor(sortField, listOptions.cursor)

      const filters = filtersFor(listOptions)
      const cursorFilter =
        cursor === null
          ? sql``
          : sql`and (${sortColumn} ${cmp} ${cursor.value}
                 or (${sortColumn} = ${cursor.value} and id ${cmp} ${cursor.id}))`

      const result = await db.query<MediaRow>(sql`
        select * from ${table}
        where 1 = 1 ${filters} ${cursorFilter}
        order by ${sortColumn} ${order}, id ${order}
        limit ${limit(pageSize + 1)}`)

      const hasMore = result.rows.length > pageSize
      const rows = result.rows.slice(0, pageSize)
      const page = rows.map(rowToAsset)
      const lastRow = rows[rows.length - 1]

      return {
        items: page,
        hasMore,
        nextCursor:
          hasMore && lastRow !== undefined
            ? encodeCursor(sortField, sortValueOf(sortField, lastRow), lastRow.id)
            : null,
      }
    },

    count: async (
      listOptions: Omit<ListMediaOptions, 'limit' | 'cursor'> = {},
    ): Promise<number> => {
      await ensureTable()
      const filters = filtersFor(listOptions)
      const result = await db.query<{ c: number | string }>(sql`
        select count(*) as c from ${table} where 1 = 1 ${filters}`)
      return Number(result.rows[0]?.c ?? 0)
    },

    update: async (id: string, input: UpdateMediaInput): Promise<MediaAsset> => {
      await ensureTable()
      const existing = await db.query<MediaRow>(sql`select * from ${table} where id = ${id}`)
      const current = existing.rows[0]
      if (current === undefined) throw notFound(id)

      const currentDecorative = current.decorative === true || current.decorative === 1
      const decorative = input.decorative ?? currentDecorative
      const alt = decorative ? '' : (input.alt ?? current.alt)
      const justification = decorative
        ? (input.decorativeJustification ?? current.decorative_justification)
        : null
      validateAltPolicy(alt, decorative, justification)

      const focal =
        input.focal === undefined
          ? current.focal
          : input.focal === null
            ? null
            : JSON.stringify(input.focal)

      const tags = input.tags === undefined ? current.tags : serializeTags(input.tags)

      await db.query(sql`
        update ${table}
        set alt = ${alt},
            decorative = ${decorative},
            decorative_justification = ${justification},
            focal = ${focal},
            tags = ${tags}
        where id = ${id}`)

      return rowToAsset({
        ...current,
        alt,
        decorative,
        decorative_justification: justification,
        focal,
        tags,
      })
    },

    replace: async (id: string, input: ReplaceMediaInput): Promise<MediaAsset> => {
      await ensureTable()
      const existing = await db.query<MediaRow>(sql`select * from ${table} where id = ${id}`)
      const current = existing.rows[0]
      if (current === undefined) throw notFound(id)

      await db.query(sql`
        update ${table}
        set mime_type = ${input.mimeType},
            size = ${input.size},
            width = ${input.width ?? null},
            height = ${input.height ?? null},
            storage_key = ${input.storageKey},
            content_hash = ${input.contentHash}
        where id = ${id}`)

      return rowToAsset({
        ...current,
        mime_type: input.mimeType,
        size: input.size,
        width: input.width ?? null,
        height: input.height ?? null,
        storage_key: input.storageKey,
        content_hash: input.contentHash,
      })
    },

    delete: async (id: string): Promise<void> => {
      await ensureTable()
      await db.query(sql`delete from ${table} where id = ${id}`)
    },
  }
}
