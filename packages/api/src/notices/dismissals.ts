import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const NOTICE_DISMISSALS_TABLE = 'cogenta_notice_dismissals'

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

/**
 * Which notices this person has said "not now" to.
 *
 * Server-side rather than in `localStorage` on purpose: dismissing a
 * recommendation is a decision about an account, not about a browser. Storing
 * it client-side would make the same reminder reappear on every new device and
 * vanish on a cleared cache, which is exactly the behaviour that trains people
 * to stop reading notices.
 *
 * Scoped by `user_id` in every single query — the store has no method that can
 * read or write another account's dismissals, so there is no call site to audit
 * for having forgotten the filter.
 */
export interface NoticeDismissalStore {
  ensureTable(): Promise<void>
  dismissed(userId: string): Promise<ReadonlySet<string>>
  dismiss(userId: string, noticeId: string): Promise<void>
}

export function createNoticeDismissalStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): NoticeDismissalStore {
  const table = identifier(NOTICE_DISMISSALS_TABLE, db.dialect)

  return {
    ensureTable: async () => {
      const t64 = textColumn(db.dialect, 64)
      const t255 = textColumn(db.dialect, 255)
      await db.query(sql`
        create table if not exists ${table} (
          id ${t64} not null primary key,
          user_id ${t64} not null,
          notice_id ${t255} not null,
          dismissed_at ${t64} not null
        )`)
      await db
        .query(
          sql`create index ${identifier('cogenta_notice_dismissals_user', db.dialect)} on ${table} (user_id)`,
        )
        .catch(() => undefined) // already there — no portable "if not exists" for indexes
    },

    dismissed: async (userId) => {
      const result = await db.query<{ notice_id: string }>(
        sql`select notice_id from ${table} where user_id = ${userId}`,
      )
      return new Set(result.rows.map((row) => row.notice_id))
    },

    dismiss: async (userId, noticeId) => {
      // Dismissing twice is not an error — a double-click, or two tabs open on
      // the same page, must not turn into a 500. The read first is not a
      // uniqueness guarantee (two concurrent calls could both find nothing),
      // and it does not need to be: a duplicate row means the notice is still
      // dismissed, which is the only thing anyone reads this table for.
      const existing = await db.query<{ id: string }>(
        sql`select id from ${table} where user_id = ${userId} and notice_id = ${noticeId}`,
      )
      if (existing.rows.length > 0) return

      await db.query(sql`
        insert into ${table} (id, user_id, notice_id, dismissed_at)
        values (${newId(now)}, ${userId}, ${noticeId}, ${new Date(now()).toISOString()})`)
    },
  }
}
