import { type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { textColumn, timestampColumn, uuidColumn } from './columns.js'
import { indexName } from './naming.js'

/**
 * "Contenu programmé dont la publication a échoué" — fiche 38 task 1's last
 * named source. `registerScheduledPublishing`'s handler (wired by
 * `cogenta serve`) can throw — the target collection's own validation refuses
 * the entry, a `restrict` foreign key blocks it, a driver hiccups — and until
 * now nothing surfaced that anywhere: the queue's own row silently sits in
 * `status: 'failed'` after its retries are exhausted, and the only way to
 * notice was to already suspect something and go look at the table by hand.
 *
 * Deliberately its own tiny table rather than a query against the queue
 * driver's internal job table: the queue interface (`@cogenta/core`) has no
 * "list jobs of this name past their retries" method, and reaching past it
 * into one specific driver's schema would tie this notice to whichever queue
 * driver a site happens to run — the opposite of R1. `record`/`clear` are
 * called from the same handler that already knows collection/entry/locale,
 * so nothing here has to guess.
 */
export const SCHEDULED_PUBLISH_FAILURES_TABLE = 'cogenta_scheduled_publish_failures'

export interface ScheduledPublishFailure {
  readonly collection: string
  readonly entryId: string
  readonly locale: string
  readonly error: string
  readonly failedAt: string
}

export interface ScheduledPublishFailureStore {
  ensureTable(): Promise<void>
  /** Idempotent: a second failed attempt on the same entry replaces the first, it does not pile up. */
  record(failure: Omit<ScheduledPublishFailure, 'failedAt'>): Promise<void>
  /** Called once a later attempt (or a fresh schedule) actually publishes the entry. */
  clear(collection: string, entryId: string, locale: string): Promise<void>
  list(): Promise<readonly ScheduledPublishFailure[]>
}

interface FailureRow {
  collection: string
  entry_id: string
  locale: string
  error: string
  failed_at: string
}

export function createScheduledPublishFailureStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): ScheduledPublishFailureStore {
  const table = identifier(SCHEDULED_PUBLISH_FAILURES_TABLE, db.dialect)
  const d = db.dialect

  return {
    async ensureTable() {
      await db.query(sql`
        create table if not exists ${table} (
          id ${uuidColumn(d)} not null primary key,
          collection ${textColumn(d, 128)} not null,
          entry_id ${uuidColumn(d)} not null,
          locale ${textColumn(d, 16)} not null,
          error ${textColumn(d, 2048)} not null,
          failed_at ${timestampColumn(d)} not null
        )`)
      await db
        .query(sql`
          create unique index ${identifier(indexName(SCHEDULED_PUBLISH_FAILURES_TABLE, 'entry'), d)}
          on ${table} (collection, entry_id, locale)`)
        .catch(() => undefined) // already there — no portable "if not exists" for indexes
    },

    async record(failure) {
      await db.query(sql`
        delete from ${table}
        where collection = ${failure.collection} and entry_id = ${failure.entryId} and locale = ${failure.locale}`)
      await db.query(sql`
        insert into ${table} (id, collection, entry_id, locale, error, failed_at)
        values (${newId(now)}, ${failure.collection}, ${failure.entryId}, ${failure.locale}, ${failure.error}, ${new Date(now()).toISOString()})`)
    },

    async clear(collection, entryId, locale) {
      await db.query(sql`
        delete from ${table}
        where collection = ${collection} and entry_id = ${entryId} and locale = ${locale}`)
    },

    async list() {
      const result = await db.query<FailureRow>(sql`select * from ${table} order by failed_at desc`)
      return result.rows.map((row) => ({
        collection: row.collection,
        entryId: row.entry_id,
        locale: row.locale,
        error: row.error,
        failedAt: row.failed_at,
      }))
    },
  }
}
