import { createHash } from 'node:crypto'
import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { TABLES } from './tables.js'
import type { AuditEntry, RecordAuditInput } from './types.js'

/**
 * Append-only, hash-chained, per `docs/02-architecture.md` § 4.7: every
 * action produces a diff and lands in an audit log chained by hash. L4's
 * agents will write to the same table — this is built generic (actor, action,
 * target, diff) so that lot does not redesign it, it just gets a second
 * writer.
 *
 * The chain is what turns "consultable" into "trustworthy": editing a row in
 * the table breaks its hash, and every entry after it, which is detectable by
 * anyone who kept the last known-good hash — not just by whoever has write
 * access to the database.
 */

interface AuditRow {
  id: string
  at: string
  actor_id: string | null
  actor_roles: string
  action: string
  collection_name: string | null
  entry_id: string | null
  diff: string | null
  hash: string
  previous_hash: string | null
}

function fromRow(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actorId: row.actor_id,
    actorRoles: JSON.parse(row.actor_roles) as readonly string[],
    action: row.action,
    collection: row.collection_name,
    entryId: row.entry_id,
    diff: row.diff === null ? null : (JSON.parse(row.diff) as Record<string, unknown>),
    hash: row.hash,
    previousHash: row.previous_hash,
  }
}

function computeHash(previousHash: string | null, fields: Omit<AuditRow, 'hash'>): string {
  const canonical = JSON.stringify([
    previousHash,
    fields.id,
    fields.at,
    fields.actor_id,
    fields.actor_roles,
    fields.action,
    fields.collection_name,
    fields.entry_id,
    fields.diff,
  ])
  return createHash('sha256').update(canonical).digest('hex')
}

export interface AuditFilter {
  readonly actorId?: string
  readonly action?: string
  readonly collection?: string
  readonly since?: string
  readonly limit?: number
}

export interface AuditLog {
  record(input: RecordAuditInput): Promise<AuditEntry>
  list(filter?: AuditFilter): Promise<readonly AuditEntry[]>
  /** Recomputes every hash and compares. Throws `AUDIT_CHAIN_BROKEN` naming the first mismatch. */
  verify(): Promise<void>
}

export function createAuditLog(db: DatabaseHandle, now: () => number = Date.now): AuditLog {
  const table = identifier(TABLES.auditLog, db.dialect)

  // Serialises appends within this process. Two concurrent writers computing
  // "the current last hash" from a read that has not committed yet would
  // both chain to the same previous hash and fork the chain — a database
  // transaction alone does not stop that on every dialect's default isolation
  // level, so the invariant is enforced here, once, rather than trusted to
  // whichever caller remembers to lock.
  let appendQueue: Promise<unknown> = Promise.resolve()

  async function lastHash(): Promise<string | null> {
    const result = await db.query<{ hash: string }>(
      sql`select hash from ${table} order by at desc, id desc limit ${1}`,
    )
    return result.rows[0]?.hash ?? null
  }

  return {
    record: (input) => {
      const task = appendQueue.then(async (): Promise<AuditEntry> => {
        const previousHash = await lastHash()
        const base = {
          id: newId(now),
          at: new Date(now()).toISOString(),
          actor_id: input.actorId,
          actor_roles: JSON.stringify(input.actorRoles),
          action: input.action,
          collection_name: input.collection ?? null,
          entry_id: input.entryId ?? null,
          diff: input.diff === undefined ? null : JSON.stringify(input.diff),
          previous_hash: previousHash,
        }
        const hash = computeHash(previousHash, base)

        await db.query(sql`
          insert into ${table} (id, at, actor_id, actor_roles, action, collection_name, entry_id, diff, hash, previous_hash)
          values (${base.id}, ${base.at}, ${base.actor_id}, ${base.actor_roles}, ${base.action},
                  ${base.collection_name}, ${base.entry_id}, ${base.diff}, ${hash}, ${base.previous_hash})`)

        return fromRow({ ...base, hash })
      })

      // The queue must advance even if this append fails, or every append
      // after a failure would wait on a promise that never resolves.
      appendQueue = task.catch(() => undefined)
      return task
    },

    list: async (filter = {}) => {
      const conditions = [sql`1 = 1`]
      if (filter.actorId !== undefined) conditions.push(sql`actor_id = ${filter.actorId}`)
      if (filter.action !== undefined) conditions.push(sql`action = ${filter.action}`)
      if (filter.collection !== undefined)
        conditions.push(sql`collection_name = ${filter.collection}`)
      if (filter.since !== undefined) conditions.push(sql`at >= ${filter.since}`)

      const where = conditions.reduce((left, right) => sql`${left} and ${right}`)
      const result = await db.query<AuditRow>(sql`
        select * from ${table} where ${where} order by at desc, id desc limit ${filter.limit ?? 200}`)
      return result.rows.map(fromRow)
    },

    verify: async () => {
      const result = await db.query<AuditRow>(sql`select * from ${table} order by at asc, id asc`)
      let expectedPrevious: string | null = null

      for (const row of result.rows) {
        if (row.previous_hash !== expectedPrevious) {
          throw new CogentaError({
            code: 'AUDIT_CHAIN_BROKEN',
            message: `Audit entry ${row.id} does not chain from the entry before it.`,
            hint: 'The audit log has been edited or reordered outside of record(). Treat every entry from this point on as untrusted.',
            details: { entryId: row.id },
          })
        }

        const { hash, ...rest } = row
        if (computeHash(row.previous_hash, rest) !== hash) {
          throw new CogentaError({
            code: 'AUDIT_CHAIN_BROKEN',
            message: `Audit entry ${row.id} has been modified since it was recorded.`,
            hint: 'Its stored hash no longer matches its content. Treat every entry from this point on as untrusted.',
            details: { entryId: row.id },
          })
        }

        expectedPrevious = hash
      }
    },
  }
}
