import { randomUUID } from 'node:crypto'
import { type DatabaseHandle, identifier, limit, sql } from '../db/index.js'
import { CogentaError } from '../errors/index.js'
import type {
  CreateMediaInput,
  FocalPoint,
  ListMediaOptions,
  MediaAsset,
  MediaPage,
  MediaStore,
  UpdateMediaInput,
} from './types.js'

const TABLE = 'cogenta_media'
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

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
  created_at: string
  created_by: string | null
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

function encodeCursor(row: { createdAt: string; id: string }): string {
  return Buffer.from(`${row.createdAt}|${row.id}`, 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    if (createdAt === undefined || id === undefined) return null
    return { createdAt, id }
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

    ready = true
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

      await db.query(sql`
        insert into ${table}
          (id, kind, filename, mime_type, size, width, height, alt, decorative,
           decorative_justification, focal, storage_key, created_at, created_by)
        values
          (${id}, ${input.kind}, ${input.filename}, ${input.mimeType}, ${input.size},
           ${input.width ?? null}, ${input.height ?? null}, ${alt}, ${decorative},
           ${justification}, ${input.focal === undefined || input.focal === null ? null : JSON.stringify(input.focal)},
           ${input.storageKey}, ${createdAt}, ${input.createdBy ?? null})`)

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
      const cursor = listOptions.cursor === undefined ? null : decodeCursor(listOptions.cursor)

      const kindFilter =
        listOptions.kind === undefined ? sql`` : sql`and kind = ${listOptions.kind}`
      const cursorFilter =
        cursor === null
          ? sql``
          : sql`and (created_at < ${cursor.createdAt}
                 or (created_at = ${cursor.createdAt} and id < ${cursor.id}))`

      const result = await db.query<MediaRow>(sql`
        select * from ${table}
        where 1 = 1 ${kindFilter} ${cursorFilter}
        order by created_at desc, id desc
        limit ${limit(pageSize + 1)}`)

      const hasMore = result.rows.length > pageSize
      const page = result.rows.slice(0, pageSize).map(rowToAsset)
      const last = page[page.length - 1]

      return {
        items: page,
        hasMore,
        nextCursor: hasMore && last !== undefined ? encodeCursor(last) : null,
      }
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

      await db.query(sql`
        update ${table}
        set alt = ${alt},
            decorative = ${decorative},
            decorative_justification = ${justification},
            focal = ${focal}
        where id = ${id}`)

      return rowToAsset({
        ...current,
        alt,
        decorative,
        decorative_justification: justification,
        focal,
      })
    },

    delete: async (id: string): Promise<void> => {
      await ensureTable()
      await db.query(sql`delete from ${table} where id = ${id}`)
    },
  }
}
