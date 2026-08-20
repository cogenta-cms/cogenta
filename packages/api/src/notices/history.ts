import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'
import type { AdminNotice, NoticeSeverity } from './types.js'

export const NOTICE_HISTORY_TABLE = 'cogenta_notice_history'

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * "On retrouve une notice rejetée dans l'historique" — fiche 38 task 2.
 *
 * `NoticeDismissalStore` (`dismissals.ts`) only ever answers "is this id
 * hidden" — it was never meant to remember what a notice *was*, and a
 * dismissed-then-recomputed notice vanishes from `GET /api/notices` with
 * nothing left behind. This store is the other half: every notice a source
 * has ever shown a person, kept until they resolve it (the source stops
 * emitting it — the thing it recommended is now true) or it is asked for
 * again after having been resolved (see `reappear` below).
 *
 * A row here is never authoritative on its own — the *source* still decides
 * whether a notice is currently true, on every request, exactly as
 * `router.ts` already does. This table only remembers what the router saw on
 * past calls, so "what happened while I was on holiday" has an answer.
 */
export interface NoticeHistoryEntry {
  readonly id: string
  readonly noticeId: string
  readonly code: string
  readonly severity: NoticeSeverity
  readonly params: Readonly<Record<string, string>>
  readonly actionCode: string | null
  readonly actionHref: string | null
  readonly dismissible: boolean
  readonly firstSeenAt: string
  readonly lastSeenAt: string
  /** `null` while the source is still emitting this notice. */
  readonly resolvedAt: string | null
  /** `null` until the person opens the notification centre and marks it read. */
  readonly readAt: string | null
}

export interface NoticeHistoryFilter {
  readonly severity?: NoticeSeverity
  /** ISO 8601. Rows last seen before this are excluded. */
  readonly since?: string
  /** ISO 8601. Rows last seen after this are excluded. */
  readonly until?: string
}

export interface NoticeHistoryStore {
  ensureTable(): Promise<void>
  /**
   * Reconciles the history with what the router just computed as currently
   * active for this person. Returns the entries that are new *this call* —
   * never seen before, or reappearing after having been resolved — which is
   * exactly what a channel bridge (task 3) should notify about: an entry
   * that was already on screen a minute ago must not fire a second message.
   */
  sync(userId: string, active: readonly AdminNotice[]): Promise<readonly NoticeHistoryEntry[]>
  list(userId: string, filter?: NoticeHistoryFilter): Promise<readonly NoticeHistoryEntry[]>
  unreadCount(userId: string): Promise<number>
  /** `ids: 'all'` marks every one of this person's entries read, not just the ones currently active. */
  markRead(userId: string, ids: readonly string[] | 'all'): Promise<void>
}

interface HistoryRow {
  id: string
  user_id: string
  notice_id: string
  code: string
  severity: string
  params: string
  action_code: string | null
  action_href: string | null
  dismissible: number
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  read_at: string | null
}

function rowToEntry(row: HistoryRow): NoticeHistoryEntry {
  return {
    id: row.id,
    noticeId: row.notice_id,
    code: row.code,
    severity: row.severity as NoticeSeverity,
    params: JSON.parse(row.params) as Record<string, string>,
    actionCode: row.action_code,
    actionHref: row.action_href,
    dismissible: row.dismissible === 1,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
    readAt: row.read_at,
  }
}

export function createNoticeHistoryStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): NoticeHistoryStore {
  const table = identifier(NOTICE_HISTORY_TABLE, db.dialect)

  return {
    async ensureTable() {
      const t64 = textColumn(db.dialect, 64)
      const t255 = textColumn(db.dialect, 255)
      const text = unsafeRaw('text')
      const int = unsafeRaw('integer')
      await db.query(sql`
        create table if not exists ${table} (
          id ${t64} not null primary key,
          user_id ${t64} not null,
          notice_id ${t255} not null,
          code ${t255} not null,
          severity ${t64} not null,
          params ${text} not null,
          action_code ${t255},
          action_href ${t255},
          dismissible ${int} not null,
          first_seen_at ${t64} not null,
          last_seen_at ${t64} not null,
          resolved_at ${t64},
          read_at ${t64}
        )`)
      await db
        .query(sql`
          create unique index ${identifier('cogenta_notice_history_entry', db.dialect)}
          on ${table} (user_id, notice_id)`)
        .catch(() => undefined) // already there — no portable "if not exists" for indexes
      await db
        .query(
          sql`create index ${identifier('cogenta_notice_history_user', db.dialect)} on ${table} (user_id)`,
        )
        .catch(() => undefined)
    },

    async sync(userId, active) {
      const nowIso = new Date(now()).toISOString()
      const activeById = new Map(active.map((notice) => [notice.id, notice]))

      const existingResult = await db.query<HistoryRow>(
        sql`select * from ${table} where user_id = ${userId}`,
      )
      const existingByNoticeId = new Map(existingResult.rows.map((row) => [row.notice_id, row]))

      const changed: NoticeHistoryEntry[] = []

      for (const notice of active) {
        const existing = existingByNoticeId.get(notice.id)
        const paramsJson = JSON.stringify(notice.params ?? {})

        if (existing === undefined) {
          const id = newId(now)
          await db.query(sql`
            insert into ${table}
              (id, user_id, notice_id, code, severity, params, action_code, action_href, dismissible, first_seen_at, last_seen_at, resolved_at, read_at)
            values (
              ${id}, ${userId}, ${notice.id}, ${notice.code}, ${notice.severity}, ${paramsJson},
              ${notice.action?.code ?? null}, ${notice.action?.href ?? null}, ${notice.dismissible ? 1 : 0},
              ${nowIso}, ${nowIso}, ${null}, ${null}
            )`)
          changed.push({
            id,
            noticeId: notice.id,
            code: notice.code,
            severity: notice.severity,
            params: notice.params ?? {},
            actionCode: notice.action?.code ?? null,
            actionHref: notice.action?.href ?? null,
            dismissible: notice.dismissible,
            firstSeenAt: nowIso,
            lastSeenAt: nowIso,
            resolvedAt: null,
            readAt: null,
          })
          continue
        }

        const reappeared = existing.resolved_at !== null
        await db.query(sql`
          update ${table}
          set code = ${notice.code}, severity = ${notice.severity}, params = ${paramsJson},
              action_code = ${notice.action?.code ?? null}, action_href = ${notice.action?.href ?? null},
              dismissible = ${notice.dismissible ? 1 : 0}, last_seen_at = ${nowIso}, resolved_at = ${null}
          where id = ${existing.id}`)

        if (reappeared) {
          changed.push(
            rowToEntry({
              ...existing,
              code: notice.code,
              severity: notice.severity,
              params: paramsJson,
              action_code: notice.action?.code ?? null,
              action_href: notice.action?.href ?? null,
              dismissible: notice.dismissible ? 1 : 0,
              last_seen_at: nowIso,
              resolved_at: null,
            }),
          )
        }
      }

      // Anything still unresolved in the table but no longer among the
      // active notices has, by definition, been resolved — the source
      // stopped emitting it.
      for (const row of existingResult.rows) {
        if (row.resolved_at !== null) continue
        if (activeById.has(row.notice_id)) continue
        await db.query(sql`update ${table} set resolved_at = ${nowIso} where id = ${row.id}`)
      }

      return changed
    },

    async list(userId, filter) {
      let statement = sql`select * from ${table} where user_id = ${userId}`
      if (filter?.severity !== undefined) {
        statement = sql`${statement} and severity = ${filter.severity}`
      }
      if (filter?.since !== undefined) {
        statement = sql`${statement} and last_seen_at >= ${filter.since}`
      }
      if (filter?.until !== undefined) {
        statement = sql`${statement} and last_seen_at <= ${filter.until}`
      }
      statement = sql`${statement} order by last_seen_at desc`
      const result = await db.query<HistoryRow>(statement)
      return result.rows.map(rowToEntry)
    },

    async unreadCount(userId) {
      const result = await db.query<{ n: number }>(
        sql`select count(*) as n from ${table} where user_id = ${userId} and read_at is null`,
      )
      return Number(result.rows[0]?.n ?? 0)
    },

    async markRead(userId, ids) {
      const nowIso = new Date(now()).toISOString()
      if (ids === 'all') {
        await db.query(sql`
          update ${table} set read_at = ${nowIso} where user_id = ${userId} and read_at is null`)
        return
      }
      for (const id of ids) {
        await db.query(sql`
          update ${table} set read_at = ${nowIso} where user_id = ${userId} and id = ${id} and read_at is null`)
      }
    },
  }
}
