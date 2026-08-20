import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  limit as limitFragment,
  newId,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import { toBool, toInt, toNullableText, toText } from './rows.js'
import { TABLES } from './tables.js'
import {
  COMMENT_STATUSES,
  type Comment,
  type CommentCounts,
  type CommentCreateInput,
  type CommentListOptions,
  type CommentModeration,
  type CommentPage,
  type CommentStatus,
} from './types.js'

type Row = Record<string, unknown>

const MAX_BODY_LENGTH = 20_000
const MAX_NAME_LENGTH = 200

export interface CommentStoreOptions {
  readonly db: DatabaseHandle
  readonly now?: () => Date
}

export interface CommentModerationUpdate {
  readonly flagged: boolean
  readonly severity: 'none' | 'low' | 'medium' | 'high'
  readonly reason: string
}

export interface CommentStore {
  create(input: CommentCreateInput): Promise<Comment>
  get(id: string): Promise<Comment | null>
  list(options?: CommentListOptions): Promise<CommentPage>
  /** For rendering a public thread: approved comments for one entry, oldest first. */
  listApprovedForEntry(collection: string, entryId: string): Promise<readonly Comment[]>
  counts(): Promise<CommentCounts>
  setStatus(id: string, status: CommentStatus, moderatedBy: string | null): Promise<Comment>
  bulkSetStatus(
    ids: readonly string[],
    status: CommentStatus,
    moderatedBy: string | null,
  ): Promise<number>
  setModeration(id: string, moderation: CommentModerationUpdate): Promise<Comment>
  /** A real, irreversible delete — distinct from `setStatus(id, 'trash', …)`. */
  purge(id: string): Promise<void>
  /** How many comments this author (by hashed IP) already has approved — the WordPress "auto-approve a returning commenter" rule (fiche 15 task 2). */
  countApprovedByIp(ipHash: string): Promise<number>
}

function bodyInvalid(reason: string): CogentaError {
  return new CogentaError({
    code: 'COMMENT_BODY_INVALID',
    message: `Comment body is invalid: ${reason}.`,
    hint: 'A comment body is required, plain text, and at most 20000 characters.',
  })
}

function authorInvalid(reason: string): CogentaError {
  return new CogentaError({
    code: 'COMMENT_AUTHOR_INVALID',
    message: `Comment author is invalid: ${reason}.`,
    hint: 'Provide a name and a valid e-mail address.',
  })
}

function notFound(id: string): CogentaError {
  return new CogentaError({
    code: 'COMMENT_NOT_FOUND',
    message: `No comment "${id}" exists.`,
    hint: 'Check the id, or that it was not already purged.',
    details: { id },
  })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

function assertCreateInput(input: CommentCreateInput): void {
  const body = input.body.trim()
  if (body.length === 0) throw bodyInvalid('empty')
  if (input.body.length > MAX_BODY_LENGTH) throw bodyInvalid('too long')
  // R3 (first line of defense): a body that already looks like markup is
  // refused outright rather than "sanitised" — sanitising invites the next
  // bypass, refusing does not.
  if (/<[a-z!/][\s\S]*>/iu.test(input.body)) {
    throw bodyInvalid('must be plain text, no HTML tags')
  }

  const name = input.author.name.trim()
  if (name.length === 0) throw authorInvalid('name is required')
  if (name.length > MAX_NAME_LENGTH) throw authorInvalid('name too long')
  if (!EMAIL_RE.test(input.author.email)) throw authorInvalid('not a valid e-mail address')

  if (input.collection.trim().length === 0 || input.entryId.trim().length === 0) {
    throw new CogentaError({
      code: 'COMMENT_TARGET_INVALID',
      message: 'A comment must name a collection and an entry id.',
      hint: 'Both collection and entryId are required.',
    })
  }
}

function toModeration(row: Row): CommentModeration {
  const flagged = row['moderation_flagged']
  return {
    flagged: flagged === null || flagged === undefined ? null : toBool(flagged),
    severity: toNullableText(row['moderation_severity']) as CommentModeration['severity'],
    reason: toNullableText(row['moderation_reason']),
  }
}

function toComment(row: Row): Comment {
  return {
    id: toText(row['id'], 'id'),
    collection: toText(row['collection'], 'collection'),
    entryId: toText(row['entry_id'], 'entry_id'),
    locale: toNullableText(row['locale']),
    parentId: toNullableText(row['parent_id']),
    userId: toNullableText(row['user_id']),
    authorName: toText(row['author_name'], 'author_name'),
    authorEmail: toText(row['author_email'], 'author_email'),
    authorUrl: toNullableText(row['author_url']),
    body: toText(row['body'], 'body'),
    status: toText(row['status'], 'status') as CommentStatus,
    ipHash: toNullableText(row['ip_hash']),
    userAgent: toNullableText(row['user_agent']),
    moderation: toModeration(row),
    provenance: toText(row['provenance'], 'provenance') as Comment['provenance'],
    createdAt: toText(row['created_at'], 'created_at'),
    updatedAt: toText(row['updated_at'], 'updated_at'),
    moderatedAt: toNullableText(row['moderated_at']),
    moderatedBy: toNullableText(row['moderated_by']),
  }
}

export function createCommentStore(options: CommentStoreOptions): CommentStore {
  const { db } = options
  const d = db.dialect
  const table = identifier(TABLES.comments, d)
  const now = options.now ?? ((): Date => new Date())
  const stamp = (): string => now().toISOString()

  async function readRow(id: string): Promise<Row | null> {
    const result = await db.query<Row>(sql`select * from ${table} where id = ${id}`)
    return result.rows[0] ?? null
  }

  async function requireRow(id: string): Promise<Row> {
    const row = await readRow(id)
    if (row === null) throw notFound(id)
    return row
  }

  return {
    create: async (input) => {
      assertCreateInput(input)

      let parentId: string | null = null
      if (input.parentId !== undefined && input.parentId !== null) {
        const parent = await readRow(input.parentId)
        if (parent === null) {
          throw new CogentaError({
            code: 'COMMENT_PARENT_INVALID',
            message: `Parent comment "${input.parentId}" does not exist.`,
            hint: 'Reply to a comment that still exists, or omit parentId for a top-level comment.',
          })
        }
        if (
          toText(parent['collection'], 'collection') !== input.collection ||
          toText(parent['entry_id'], 'entry_id') !== input.entryId
        ) {
          throw new CogentaError({
            code: 'COMMENT_PARENT_INVALID',
            message: 'A reply must target the same entry as its parent.',
            hint: 'parentId must belong to the same collection and entryId.',
          })
        }
        parentId = input.parentId
      }

      const id = newId(() => now().getTime())
      const at = stamp()
      await db.query(sql`
        insert into ${table} (
          id, collection, entry_id, locale, parent_id, user_id, author_name, author_email,
          author_url, body, status, ip_hash, user_agent, moderation_flagged, moderation_severity,
          moderation_reason, provenance, created_at, updated_at, moderated_at, moderated_by
        ) values (
          ${id}, ${input.collection}, ${input.entryId}, ${input.locale ?? null}, ${parentId},
          ${input.author.userId ?? null}, ${input.author.name.trim()}, ${input.author.email.trim()},
          ${input.author.url ?? null}, ${input.body}, ${input.status}, ${input.ipHash ?? null},
          ${input.userAgent ?? null}, ${null}, ${null}, ${null}, ${input.provenance ?? 'human'},
          ${at}, ${at}, ${null}, ${null}
        )`)

      return toComment(await requireRow(id))
    },

    get: async (id) => {
      const row = await readRow(id)
      return row === null ? null : toComment(row)
    },

    list: async (opts = {}) => {
      const conditions: SqlFragment[] = []
      if (opts.status !== undefined) conditions.push(sql`status = ${opts.status}`)
      if (opts.collection !== undefined) conditions.push(sql`collection = ${opts.collection}`)
      if (opts.entryId !== undefined) conditions.push(sql`entry_id = ${opts.entryId}`)
      const search = opts.search?.trim().toLowerCase()
      if (search !== undefined && search !== '') {
        conditions.push(
          sql`(lower(author_name) like ${`%${search}%`} or lower(author_email) like ${`%${search}%`} or lower(body) like ${`%${search}%`})`,
        )
      }

      let where = sql``
      conditions.forEach((condition, index) => {
        where = sql`${where} ${index === 0 ? sql`where` : sql`and`} ${condition}`
      })

      const countResult = await db.query<{ n: number }>(
        sql`select count(*) as n from ${table} ${where}`,
      )
      const total = toInt(countResult.rows[0]?.n ?? 0, 'count')

      const take = opts.limit ?? 50
      const skip = opts.offset ?? 0
      const result = await db.query<Row>(sql`
        select * from ${table} ${where}
        order by created_at desc, id desc
        limit ${limitFragment(take)} offset ${limitFragment(skip)}`)

      return { items: result.rows.map(toComment), total }
    },

    listApprovedForEntry: async (collection, entryId) => {
      const result = await db.query<Row>(sql`
        select * from ${table}
        where collection = ${collection} and entry_id = ${entryId} and status = 'approved'
        order by created_at asc`)
      return result.rows.map(toComment)
    },

    counts: async () => {
      const result = await db.query<{ status: string; n: number }>(
        sql`select status, count(*) as n from ${table} group by status`,
      )
      const byStatus = new Map(result.rows.map((row) => [row.status, toInt(row.n, 'count')]))
      return {
        pending: byStatus.get('pending') ?? 0,
        approved: byStatus.get('approved') ?? 0,
        spam: byStatus.get('spam') ?? 0,
        trash: byStatus.get('trash') ?? 0,
      }
    },

    setStatus: async (id, status, moderatedBy) => {
      if (!COMMENT_STATUSES.includes(status)) {
        throw new CogentaError({
          code: 'COMMENT_STATUS_INVALID',
          message: `"${status}" is not a known comment status.`,
          hint: `Use one of: ${COMMENT_STATUSES.join(', ')}.`,
        })
      }
      await requireRow(id)
      const at = stamp()
      await db.query(sql`
        update ${table}
        set status = ${status}, updated_at = ${at}, moderated_at = ${at}, moderated_by = ${moderatedBy}
        where id = ${id}`)
      return toComment(await requireRow(id))
    },

    bulkSetStatus: async (ids, status, moderatedBy) => {
      if (!COMMENT_STATUSES.includes(status)) {
        throw new CogentaError({
          code: 'COMMENT_STATUS_INVALID',
          message: `"${status}" is not a known comment status.`,
          hint: `Use one of: ${COMMENT_STATUSES.join(', ')}.`,
        })
      }
      let updated = 0
      for (const id of ids) {
        const row = await readRow(id)
        if (row === null) continue
        const at = stamp()
        await db.query(sql`
          update ${table}
          set status = ${status}, updated_at = ${at}, moderated_at = ${at}, moderated_by = ${moderatedBy}
          where id = ${id}`)
        updated += 1
      }
      return updated
    },

    setModeration: async (id, moderation) => {
      await requireRow(id)
      await db.query(sql`
        update ${table}
        set moderation_flagged = ${moderation.flagged}, moderation_severity = ${moderation.severity},
            moderation_reason = ${moderation.reason}, updated_at = ${stamp()}
        where id = ${id}`)
      return toComment(await requireRow(id))
    },

    purge: async (id) => {
      await db.query(sql`delete from ${table} where id = ${id}`)
    },

    countApprovedByIp: async (ipHash) => {
      const result = await db.query<{ n: number }>(
        sql`select count(*) as n from ${table} where ip_hash = ${ipHash} and status = 'approved'`,
      )
      return toInt(result.rows[0]?.n ?? 0, 'count')
    },
  }
}
