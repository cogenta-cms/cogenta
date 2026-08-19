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

/**
 * 301/308 are permanent (cacheable); 302/307 are temporary (never cached);
 * 410 is not a redirect at all — it tells a visitor and a crawler the page is
 * gone for good, which is honester than sending them to the home page.
 */
export type RedirectStatus = 301 | 302 | 307 | 308 | 410

/** 301 and 308 are the two search engines and browsers may cache. */
function isPermanent(status: RedirectStatus): boolean {
  return status === 301 || status === 308
}

const REDIRECT_STATUSES: readonly RedirectStatus[] = [301, 302, 307, 308, 410]

/** Falls back to 301 for anything a hand-edited table might hold that this version does not know. */
function asStatus(value: number): RedirectStatus {
  return (REDIRECT_STATUSES as readonly number[]).includes(value) ? (value as RedirectStatus) : 301
}

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
  /** Required unless `status` is 410 — a Gone rule has nothing to point at. */
  readonly to?: string
  readonly status?: RedirectStatus
  readonly collection?: string
  readonly entryId?: string
  readonly locale?: string
  readonly reason?: RedirectReason
}

/** A PATCH: only `to` and/or `status` may change. Everything else about a rule is set once, at `add()`. */
export interface UpdateRedirectInput {
  readonly to?: string
  readonly status?: RedirectStatus
}

export interface ListRedirectsOptions {
  readonly limit?: number
  readonly collection?: string
  readonly locale?: string
}

export interface RedirectResolution {
  /** For a 410, this is `from` itself — there is no destination, and the caller must not send a `Location` header. */
  readonly to: string
  readonly status: RedirectStatus
}

export interface RedirectStore {
  /** Creates the table if it is missing. Called for you by every other method. */
  ensureTable(): Promise<void>
  add(input: AddRedirectInput): Promise<RedirectRecord>
  /** Changes `to` and/or `status` of an existing rule in place — no gap where the old URL 404s. */
  update(from: string, input: UpdateRedirectInput): Promise<RedirectRecord>
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

  /**
   * A 410 row is excluded on purpose: its `to_path` is only ever itself
   * (see `add`), and chasing it would make `flattenTarget` see a path that
   * "leads back to itself" and refuse a perfectly ordinary redirect *into*
   * a page that happens to be marked Gone.
   */
  async function targetOf(tx: SqlExecutor, path: string): Promise<string | undefined> {
    const found = await tx.query<{ to_path: string }>(sql`
      select to_path from ${table} where from_path = ${path} and status != ${410} limit ${limit(1)}`)
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

  const performAdd = async (input: AddRedirectInput): Promise<RedirectRecord> => {
    await ensureTable()

    const from = checkPath(input.from, 'from')
    const status = input.status ?? 301
    const reason = input.reason ?? 'manual'
    const createdAt = now()

    // 410 (Gone) is not a redirect: there is nothing to chase or flatten,
    // and nothing else in the table should be rewritten because of it —
    // an existing rule that happened to point here keeps pointing here,
    // exactly as it would if any other ordinary page appeared at `from`.
    // `to` is stored equal to `from` so every reader of this table can
    // keep treating the column as a plain, non-null string.
    if (status === 410) {
      const record: RedirectRecord = {
        id: nextId(),
        from,
        to: from,
        status,
        collection: input.collection ?? null,
        entryId: input.entryId ?? null,
        locale: input.locale ?? null,
        reason,
        createdAt,
      }
      return db.transaction(
        async (tx) => {
          // Same delete-then-insert as below, for the same reason: one
          // behaviour across three dialects that each spell "replace" differently.
          await tx.query(sql`delete from ${table} where from_path = ${from}`)
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
    }

    if (input.to === undefined || input.to.length === 0) {
      throw new CogentaError({
        code: 'CONTENT_ROUTE_INVALID',
        message: 'A redirect needs a destination unless its status is 410 (Gone).',
        hint: 'Pass "to", or set status to 410 for a page that is gone rather than moved.',
        details: { from },
      })
    }
    const to = checkPath(input.to, 'to')

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
        // renamed. Rows already marked 410 are left alone (see `flattenTarget`
        // and `targetOf`, which never treat a Gone row as a link in a chain).
        await tx.query(sql`
            update ${table} set to_path = ${target}
            where to_path = ${from} and status != ${410}`)

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
  }

  return {
    ensureTable,
    add: performAdd,

    // A PATCH by another name: `to` and/or `status` change, everything else
    // — `collection`, `entryId`, `locale`, `reason` — stays what it was,
    // because none of those describe *where this redirect points*, only
    // *why it exists*. Routed through `performAdd` rather than a second copy
    // of its chain-flattening and loop-refusal logic, for the same reason
    // `add()` already treats "add at an existing `from`" as a replace: they
    // are the same operation with a different name at the call site.
    update: async (from: string, input: UpdateRedirectInput): Promise<RedirectRecord> => {
      await ensureTable()
      const normalisedFrom = normalisePath(from)

      const found = await db.query<RedirectRow>(sql`
        select * from ${table} where from_path = ${normalisedFrom} limit ${limit(1)}`)
      const row = found.rows[0]
      if (row === undefined) {
        throw new CogentaError({
          code: 'REDIRECT_UNKNOWN',
          message: `No redirect leaves "${normalisedFrom}".`,
          hint: 'Check the path — it may already have been removed, or never existed.',
          details: { from: normalisedFrom },
        })
      }
      const existing = toRecord(row)

      return performAdd({
        from: normalisedFrom,
        to: input.to ?? existing.to,
        status: input.status ?? existing.status,
        reason: existing.reason,
        ...(existing.collection === null ? {} : { collection: existing.collection }),
        ...(existing.entryId === null ? {} : { entryId: existing.entryId }),
        ...(existing.locale === null ? {} : { locale: existing.locale }),
      })
    },

    resolve: async (path: string): Promise<RedirectResolution | null> => {
      await ensureTable()

      const start = normalisePath(path)
      const seen = new Set<string>([start])
      let current = start
      let status: RedirectStatus = 301
      // Once true, a later permanent hop must not paper back over an earlier
      // temporary one — the chain as a whole must not be cached as permanent
      // by a browser that never sees the hop that made it temporary.
      let sawTemporary = false

      for (let hop = 0; hop < MAX_HOPS; hop += 1) {
        const found = await db.query<{ to_path: string; status: number }>(sql`
          select to_path, status from ${table} where from_path = ${current} limit ${limit(1)}`)

        const row = found.rows[0]
        if (row === undefined) break

        const rowStatus = asStatus(Number(row.status))

        // 410 is terminal: there is nothing further to chase, and `to_path`
        // is only ever `current` itself for a Gone row (see `add`).
        if (rowStatus === 410) return { to: current, status: 410 }

        if (isPermanent(rowStatus)) {
          if (!sawTemporary) status = rowStatus
        } else {
          status = rowStatus
          sawTemporary = true
        }
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
    status: asStatus(Number(row.status)),
    collection: row.collection,
    entryId: row.entry_id,
    locale: row.locale,
    reason: (REDIRECT_REASONS as readonly string[]).includes(row.reason)
      ? (row.reason as RedirectReason)
      : 'manual',
    createdAt: Number(row.created_at),
  }
}
