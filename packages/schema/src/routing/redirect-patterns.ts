import { CogentaError, type DatabaseHandle, identifier, limit, sql } from '@cogenta/core'
import { newId } from '../id.js'
import { normalisePath } from './router.js'

/**
 * Prefix redirects — `/blog/*` to `/actualites/*` — a second, deliberately
 * simpler table beside `RedirectStore`.
 *
 * A prefix rule is **not** a regular expression, on purpose (fiche 12, R9 of
 * the écarts list: "cela n'expose pas le routage public à une expression
 * régulière catastrophique fournie par un utilisateur"). Matching is a single
 * `startsWith`, which cannot backtrack and cannot be made to run slowly by
 * any input — the property a user-supplied regex in the hot routing path
 * would give up.
 *
 * It is also **not chained or flattened** the way `RedirectStore` is. A
 * prefix rule is applied at most once per request, by construction: the
 * caller checks `RedirectStore.resolve` first and only falls back to
 * `resolve` here when that finds nothing, and this store's own `resolve`
 * never re-enters itself. That sidesteps the loop/flattening machinery
 * `redirects.ts` needs entirely, rather than reimplementing it for a second
 * shape of rule — the "Confort" tier this feature belongs to does not carry
 * the same weight as the exact-match table's chain-safety guarantees.
 */

export const REDIRECT_PATTERNS_TABLE = 'cogenta_redirect_patterns'

/** Same bound as `RedirectStore`, and for the same reason: kept in step with the DDL below. */
const MAX_PATH_LENGTH = 512

/**
 * Hard cap on distinct prefix rules.
 *
 * `resolve` below scans every rule to find the longest matching prefix — the
 * only portable way to do "most specific prefix wins" across three SQL
 * dialects without a second `LIKE`-based index scheme for a feature this
 * small. That scan runs on every public request that reaches it, so the
 * table this cap bounds is deliberately a short, curated list of URL-structure
 * migrations, never an import target the way the exact-match table is.
 */
const MAX_PATTERNS = 200

export type RedirectPatternStatus = 301 | 302

export interface RedirectPatternRecord {
  readonly id: string
  /** Always ends with `/`. `/blog/*` is stored and shown as `/blog/`. */
  readonly fromPrefix: string
  readonly toPrefix: string
  readonly status: RedirectPatternStatus
  /** Epoch milliseconds. */
  readonly createdAt: number
}

export interface AddRedirectPatternInput {
  /** `/blog/*` or `/blog/` — the trailing `*` is accepted and stripped. */
  readonly fromPrefix: string
  readonly toPrefix: string
  readonly status?: RedirectPatternStatus
}

export interface RedirectPatternResolution {
  readonly to: string
  readonly status: RedirectPatternStatus
}

export interface RedirectPatternStore {
  ensureTable(): Promise<void>
  add(input: AddRedirectPatternInput): Promise<RedirectPatternRecord>
  list(): Promise<readonly RedirectPatternRecord[]>
  remove(fromPrefix: string): Promise<boolean>
  /**
   * The longest matching prefix rule for `path`, rewritten once. `null` when
   * no rule's prefix matches.
   */
  resolve(path: string): Promise<RedirectPatternResolution | null>
}

export interface RedirectPatternStoreOptions {
  readonly db: DatabaseHandle
  readonly now?: () => number
  readonly newId?: () => string
  readonly table?: string
}

interface RedirectPatternRow {
  id: string
  from_prefix: string
  to_prefix: string
  status: number
  created_at: number
}

/** `/blog/*` and `/blog` both mean the same directory prefix `/blog/`. */
function normalisePrefix(raw: string, field: 'fromPrefix' | 'toPrefix'): string {
  const withoutWildcard = raw.endsWith('*') ? raw.slice(0, -1) : raw
  const normalised = normalisePath(withoutWildcard)

  if (normalised.length > MAX_PATH_LENGTH) {
    throw new CogentaError({
      code: 'CONTENT_ROUTE_INVALID',
      message: `A redirect prefix may be ${MAX_PATH_LENGTH} characters at most.`,
      hint: 'Shorten the prefix.',
      details: { field, length: normalised.length },
    })
  }

  return normalised === '/' ? '/' : `${normalised}/`
}

export function createRedirectPatternStore(
  options: RedirectPatternStoreOptions,
): RedirectPatternStore {
  const { db } = options
  const now = options.now ?? Date.now
  const nextId = options.newId ?? newId
  const table = identifier(options.table ?? REDIRECT_PATTERNS_TABLE, db.dialect)
  let ready = false

  async function ensureTable(): Promise<void> {
    if (ready) return

    await db.query(sql`
      create table if not exists ${table} (
        id varchar(64) not null primary key,
        from_prefix varchar(512) not null,
        to_prefix varchar(512) not null,
        status integer not null,
        created_at bigint not null
      )`)

    await db
      .query(
        sql`create unique index ${identifier(`${options.table ?? REDIRECT_PATTERNS_TABLE}_from`, db.dialect)}
            on ${table} (from_prefix)`,
      )
      .catch(() => undefined)

    ready = true
  }

  return {
    ensureTable,

    add: async (input: AddRedirectPatternInput): Promise<RedirectPatternRecord> => {
      await ensureTable()

      const fromPrefix = normalisePrefix(input.fromPrefix, 'fromPrefix')
      const toPrefix = normalisePrefix(input.toPrefix, 'toPrefix')
      const status = input.status ?? 301

      if (fromPrefix === toPrefix) {
        throw new CogentaError({
          code: 'CONTENT_REDIRECT_LOOP',
          message: `${fromPrefix}* cannot redirect to itself.`,
          hint: 'Nothing needs a redirect here: the prefix did not change.',
          details: { fromPrefix },
        })
      }

      const existing = await db.query<{ from_prefix: string }>(sql`
        select from_prefix from ${table} where from_prefix = ${fromPrefix} limit ${limit(1)}`)
      if (existing.rows.length === 0) {
        const counted = await db.query<{ total: number }>(sql`
          select count(*) as ${identifier('total', db.dialect)} from ${table}`)
        if (Number(counted.rows[0]?.total ?? 0) >= MAX_PATTERNS) {
          throw new CogentaError({
            code: 'CONTENT_ROUTE_INVALID',
            message: `No more than ${MAX_PATTERNS} prefix redirects are supported.`,
            hint: 'Remove an existing pattern before adding a new one, or use an exact redirect instead.',
            details: { limit: MAX_PATTERNS },
          })
        }
      }

      const record: RedirectPatternRecord = {
        id: nextId(),
        fromPrefix,
        toPrefix,
        status,
        createdAt: now(),
      }

      // Delete-then-insert, same reasoning as `RedirectStore.add`: one
      // behaviour across three dialects that each spell "replace" differently.
      await db.transaction(
        async (tx) => {
          await tx.query(sql`delete from ${table} where from_prefix = ${fromPrefix}`)
          await tx.query(sql`
            insert into ${table} (id, from_prefix, to_prefix, status, created_at)
            values (${record.id}, ${record.fromPrefix}, ${record.toPrefix}, ${record.status}, ${record.createdAt})`)
        },
        { immediate: true },
      )

      return record
    },

    list: async (): Promise<readonly RedirectPatternRecord[]> => {
      await ensureTable()
      const found = await db.query<RedirectPatternRow>(sql`
        select id, from_prefix, to_prefix, status, created_at
        from ${table}
        order by created_at desc`)
      return found.rows.map(toRecord)
    },

    remove: async (fromPrefix: string): Promise<boolean> => {
      await ensureTable()
      const result = await db.query(sql`
        delete from ${table} where from_prefix = ${normalisePrefix(fromPrefix, 'fromPrefix')}`)
      return result.rowsAffected > 0
    },

    resolve: async (path: string): Promise<RedirectPatternResolution | null> => {
      await ensureTable()
      const target = normalisePath(path)

      const rules = await db.query<RedirectPatternRow>(sql`
        select from_prefix, to_prefix, status from ${table}`)

      // Longest prefix wins — the most specific rule beats a broader one
      // rather than whichever happened to be inserted first.
      let best: {
        readonly fromPrefix: string
        readonly toPrefix: string
        readonly status: number
      } | null = null
      for (const rule of rules.rows) {
        const matches =
          target === rule.from_prefix.slice(0, -1) || target.startsWith(rule.from_prefix)
        if (!matches) continue
        if (best === null || rule.from_prefix.length > best.fromPrefix.length) {
          best = {
            fromPrefix: rule.from_prefix,
            toPrefix: rule.to_prefix,
            status: Number(rule.status),
          }
        }
      }
      if (best === null) return null

      const rest =
        target === best.fromPrefix.slice(0, -1) ? '' : target.slice(best.fromPrefix.length)
      const to = `${best.toPrefix}${rest}`.replace(/\/+$/u, '') || '/'
      const status = best.status === 302 ? 302 : 301
      return { to, status }
    },
  }
}

function toRecord(row: RedirectPatternRow): RedirectPatternRecord {
  return {
    id: row.id,
    fromPrefix: row.from_prefix,
    toPrefix: row.to_prefix,
    status: Number(row.status) === 302 ? 302 : 301,
    createdAt: Number(row.created_at),
  }
}
