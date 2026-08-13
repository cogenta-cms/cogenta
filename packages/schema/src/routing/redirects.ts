import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  limit,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import { newId } from '../id.js'
import { normalisePath } from './router.js'

/**
 * The redirect table.
 *
 * L1 calls unresolved redirects "a daily nuisance that WordPress and Drupal do
 * not solve" and asks that this work without anyone thinking about it. Two
 * things make that true, and both are enforced here rather than left to callers:
 *
 * - **Chains are flattened.** When A already points at B and B starts pointing
 *   at C, the row for A is rewritten to C. Otherwise every rename adds a hop,
 *   and a page renamed five times costs a visitor five round trips.
 * - **Loops are refused.** A→B→A serves nothing but an infinite redirect, so it
 *   is rejected at write time, where there is still a human to tell.
 */

export const REDIRECTS_TABLE = 'cogenta_redirects'

/**
 * Longest path stored, checked before insert.
 *
 * It must stay in step with the `varchar(512)` of the DDL below — a width
 * cannot be a bound parameter, so the number is written twice on purpose rather
 * than concatenated into the statement.
 */
const MAX_PATH_LENGTH = 512

/**
 * Hops `resolve` will follow before giving up.
 *
 * Flattening means one hop is normally enough. The cap exists for a table
 * edited by hand or migrated in from another CMS, where a cycle can exist that
 * this code never wrote.
 */
const MAX_HOPS = 10

export const REDIRECT_REASONS = ['slug-change', 'manual', 'import'] as const

export type RedirectReason = (typeof REDIRECT_REASONS)[number]

/** 308 and 307 are deliberately absent: a moved page is a GET, and 301 is what search engines act on. */
export type RedirectStatus = 301 | 302

export interface RedirectRecord {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly status: RedirectStatus
  readonly collection: string | null
  readonly entryId: string | null
  readonly locale: string | null
  readonly reason: RedirectReason
  /** Epoch milliseconds. */
  readonly createdAt: number
}

export interface AddRedirectInput {
  readonly from: string
  readonly to: string
  readonly status?: RedirectStatus
  readonly collection?: string
  readonly entryId?: string
  readonly locale?: string
  readonly reason?: RedirectReason
}

export interface ListRedirectsOptions {
  readonly limit?: number
  readonly collection?: string
  readonly locale?: string
}

export interface RedirectResolution {
  readonly to: string
  readonly status: RedirectStatus
}

export interface RedirectStore {
  /** Creates the table if it is missing. Called for you by every other method. */
  ensureTable(): Promise<void>
  add(input: AddRedirectInput): Promise<RedirectRecord>
  /** The final destination of a path, following any chain left by an import. */
  resolve(path: string): Promise<RedirectResolution | null>
  list(options?: ListRedirectsOptions): Promise<RedirectRecord[]>
  remove(from: string): Promise<boolean>
  /**
   * Drops any redirect leaving `path`, because real content serves it again.
   *
   * The counterpart of `add`'s loop refusal: moving a page back to its old URL
   * is legitimate, and it is this call — not a silently repaired cycle — that
   * expresses it.
   */
  release(path: string): Promise<boolean>
}

export interface RedirectStoreOptions {
  readonly db: DatabaseHandle
  /** Injected so the tests do not have to wait for a clock. */
  readonly now?: () => number
  /** Injected so a test can assert on identifiers. Defaults to UUIDv7 (ADR-0015). */
  readonly newId?: () => string
  readonly table?: string
}

interface RedirectRow {
  id: string
  from_path: string
  to_path: string
  status: number
  collection: string | null
  entry_id: string | null
  locale: string | null
  reason: string
  created_at: number
}

export function createRedirectStore(options: RedirectStoreOptions): RedirectStore {
  const { db } = options
  const now = options.now ?? Date.now
  const nextId = options.newId ?? newId
  const table = identifier(options.table ?? REDIRECTS_TABLE, db.dialect)
  let ready = false

  async function ensureTable(): Promise<void> {
    if (ready) return

    await db.query(sql`
      create table if not exists ${table} (
        id varchar(64) not null primary key,
        from_path varchar(512) not null,
        to_path varchar(512) not null,
        status integer not null,
        collection varchar(255),
        entry_id varchar(64),
        locale varchar(35),
        reason varchar(32) not null,
        created_at bigint not null
      )`)

    // Unique, not merely indexed: one source path has one destination, and the
    // database is the only place that stays true under two concurrent renames.
    await db
      .query(
        sql`create unique index ${identifier(`${options.table ?? REDIRECTS_TABLE}_from`, db.dialect)}
            on ${table} (from_path)`,
      )
      .catch(() => undefined) // already there — no dialect spells "if not exists" the same way

    ready = true
  }

  function checkPath(path: string, field: 'from' | 'to'): string {
    const normalised = normalisePath(path)

    if (normalised === '/' && field === 'from') {
      throw new CogentaError({
        code: 'CONTENT_ROUTE_INVALID',
        message: 'The site root cannot redirect.',
        hint: 'Change the home page instead of redirecting away from "/".',
      })
    }

    if (normalised.length > MAX_PATH_LENGTH) {
      throw new CogentaError({
        code: 'CONTENT_ROUTE_INVALID',
        message: `A redirect path may be ${MAX_PATH_LENGTH} characters at most.`,
        hint: 'Shorten the slug, or the pattern the collection is routed on.',
        details: { field, length: normalised.length },
      })
    }

    return normalised
  }

  async function targetOf(tx: SqlExecutor, path: string): Promise<string | undefined> {
    const found = await tx.query<{ to_path: string }>(sql`
      select to_path from ${table} where from_path = ${path} limit ${limit(1)}`)
    return found.rows[0]?.to_path
  }

  /**
   * Where `to` really leads, and proof that it does not lead back to `from`.
   *
   * Both jobs at once on purpose: they are the same walk, and doing them
   * separately would walk the chain twice and let it change in between.
   */
  async function flattenTarget(tx: SqlExecutor, from: string, to: string): Promise<string> {
    const seen = new Set<string>([from])
    let target = to

    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      if (seen.has(target)) {
        throw new CogentaError({
          code: 'CONTENT_REDIRECT_LOOP',
          message: `Redirecting ${from} to ${to} would send visitors round in a circle.`,
          hint: `${target} already leads back to ${from}. Remove that redirect first, or point this one elsewhere.`,
          details: { from, to, at: target },
        })
      }
      seen.add(target)

      const next = await targetOf(tx, target)
      if (next === undefined) return target
      target = next
    }

    throw new CogentaError({
      code: 'CONTENT_REDIRECT_LOOP',
      message: `The redirect chain starting at ${to} is more than ${MAX_HOPS} hops long.`,
      hint: 'The table holds a cycle it did not get from Cogenta. Inspect and prune it.',
      details: { from, to },
    })
  }

  async function deleteFrom(path: string): Promise<boolean> {
    await ensureTable()
    const result = await db.query(sql`
      delete from ${table} where from_path = ${normalisePath(path)}`)
    return result.rowsAffected > 0
  }

  return {
    ensureTable,

    add: async (input: AddRedirectInput): Promise<RedirectRecord> => {
      await ensureTable()

      const from = checkPath(input.from, 'from')
      const to = checkPath(input.to, 'to')
      const status = input.status ?? 301
      const reason = input.reason ?? 'manual'
      const createdAt = now()

      if (from === to) {
        throw new CogentaError({
          code: 'CONTENT_REDIRECT_LOOP',
          message: `${from} cannot redirect to itself.`,
          hint: 'Nothing needs a redirect here: the path did not change.',
          details: { from },
        })
      }

      // One transaction: the chain is read, rewritten and extended together, so
      // a second rename running at the same time cannot slot a hop in between.
      return db.transaction(
        async (tx) => {
          const target = await flattenTarget(tx, from, to)

          // Everything that pointed at the old path now points at the new one.
          // This is what keeps the table one hop deep however often an entry is
          // renamed.
          await tx.query(sql`
            update ${table} set to_path = ${target} where to_path = ${from}`)

          // Delete-then-insert rather than an upsert: `ON CONFLICT`, `ON
          // DUPLICATE KEY` and `INSERT OR REPLACE` are three different
          // statements, and this layer owes callers one behaviour.
          await tx.query(sql`delete from ${table} where from_path = ${from}`)

          const record: RedirectRecord = {
            id: nextId(),
            from,
            to: target,
            status,
            collection: input.collection ?? null,
            entryId: input.entryId ?? null,
            locale: input.locale ?? null,
            reason,
            createdAt,
          }

          await tx.query(sql`
            insert into ${table}
              (id, from_path, to_path, status, collection, entry_id, locale, reason, created_at)
            values (${record.id}, ${record.from}, ${record.to}, ${record.status},
                    ${record.collection}, ${record.entryId}, ${record.locale},
                    ${record.reason}, ${record.createdAt})`)

          return record
        },
        { immediate: true },
      )
    },

    resolve: async (path: string): Promise<RedirectResolution | null> => {
      await ensureTable()

      const start = normalisePath(path)
      const seen = new Set<string>([start])
      let current = start
      let status: RedirectStatus = 301

      for (let hop = 0; hop < MAX_HOPS; hop += 1) {
        const found = await db.query<{ to_path: string; status: number }>(sql`
          select to_path, status from ${table} where from_path = ${current} limit ${limit(1)}`)

        const row = found.rows[0]
        if (row === undefined) break

        // A 302 anywhere in the chain wins: a temporary hop must not be cached
        // as permanent by a browser that never sees the rest of the chain.
        if (Number(row.status) === 302) status = 302
        current = row.to_path

        // A cycle in imported data resolves to the last path before the loop
        // closes rather than throwing: serving one redirect is better than
        // serving a 500 on a URL a visitor actually asked for.
        if (seen.has(current)) return { to: current, status }
        seen.add(current)
      }

      return current === start ? null : { to: current, status }
    },

    list: async (listOptions: ListRedirectsOptions = {}): Promise<RedirectRecord[]> => {
      await ensureTable()

      const byCollection =
        listOptions.collection === undefined
          ? sql``
          : sql` and collection = ${listOptions.collection}`
      const byLocale =
        listOptions.locale === undefined ? sql`` : sql` and locale = ${listOptions.locale}`

      const found = await db.query<RedirectRow>(sql`
        select id, from_path, to_path, status, collection, entry_id, locale, reason, created_at
        from ${table}
        where 1 = 1${byCollection}${byLocale}
        order by created_at desc, from_path asc
        limit ${limit(listOptions.limit ?? 1000)}`)

      return found.rows.map(toRecord)
    },

    remove: deleteFrom,
    // Same statement, different intent: `remove` is an editor deleting a rule,
    // `release` is the engine noticing a path is served again. Kept as two
    // names because the call sites read as two different decisions.
    release: deleteFrom,
  }
}

function toRecord(row: RedirectRow): RedirectRecord {
  return {
    id: row.id,
    from: row.from_path,
    to: row.to_path,
    status: Number(row.status) === 302 ? 302 : 301,
    collection: row.collection,
    entryId: row.entry_id,
    locale: row.locale,
    reason: (REDIRECT_REASONS as readonly string[]).includes(row.reason)
      ? (row.reason as RedirectReason)
      : 'manual',
    createdAt: Number(row.created_at),
  }
}
