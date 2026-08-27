import { createHash } from 'node:crypto'
import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { TABLES } from './tables.js'
import type { AuditActorKind, AuditEntry, RecordAuditInput } from './types.js'

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
 *
 * Fiche 21 adds three capabilities without touching that guarantee:
 *  - `get`/`verifyRange` — a bounded form of `verify()` that resumes from a
 *    checkpoint instead of replaying the whole table (task 3).
 *  - `prune` — a real, GDPR-motivated deletion of old entries that keeps the
 *    surviving chain verifiable from a recorded anchor rather than pretending
 *    truncation never happened (task 5).
 *  - `classifyAuditActor` — a pure read of signals the log already carries,
 *    for telling a human's action from an agent's or a machine key's (task 4).
 * None of this changes `computeHash`'s canonical fields, so every hash this
 * module has ever produced still recomputes to the same value.
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
  /**
   * Added by fiche 21 task 1 (`tables.ts`'s `alter table`). Never read by
   * `computeHash` — see the long comment there for why a column that exists
   * on some rows and not others must never enter the hash.
   */
  version?: string | null
}

function fromRow(row: AuditRow): AuditEntry {
  const version = row.version
  return {
    id: row.id,
    at: row.at,
    actorId: row.actor_id,
    actorRoles: JSON.parse(row.actor_roles) as readonly string[],
    action: row.action,
    collection: row.collection_name,
    entryId: row.entry_id,
    diff: row.diff === null ? null : (JSON.parse(row.diff) as Record<string, unknown>),
    version: version === undefined || version === null ? null : Number(version),
    hash: row.hash,
    previousHash: row.previous_hash,
  }
}

/**
 * Deliberately reads only the fields this format has hashed since the very
 * first entry any site has ever recorded: `id`, `at`, `actor_id`,
 * `actor_roles`, `action`, `collection_name`, `entry_id`, `diff`, chained to
 * `previousHash`. Adding a field here changes what every already-recorded
 * hash means — do not, without a migration plan for every existing chain.
 */
function computeHash(
  previousHash: string | null,
  fields: Omit<AuditRow, 'hash' | 'version'>,
): string {
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
  /** Lower bound on `at`, inclusive. */
  readonly since?: string
  /** Upper bound on `at`, inclusive — the other half of task 2's date-range filter. */
  readonly until?: string
  /** Task 4: narrows to one origin. See `classifyAuditActor`. */
  readonly actorKind?: AuditActorKind
  readonly limit?: number
  /**
   * Cursor pagination (fiche 67 task 1): strictly older than this
   * `(at, id)` position in the `order by at desc, id desc` listing — the
   * exact position the previous page's last row sat at. Same shape as the
   * chain-verification checkpoint (`AuditChainPoint`) on purpose, but this
   * is a *listing* cursor, never confused with a verified chain position:
   * an unknown or stale `before` (the row it named was pruned since) simply
   * yields an earlier page, the same "not a security boundary" behaviour
   * `users-router.ts`'s cursor already documents.
   */
  readonly before?: { readonly at: string; readonly id: string }
}

/**
 * A point in the chain a caller has already verified up to — everything
 * `verifyRange` needs to resume from it instead of the start.
 */
export interface AuditChainPoint {
  readonly id: string
  readonly at: string
  readonly hash: string
}

export interface AuditVerifyRangeResult {
  /**
   * The newest point now verified. `since` unchanged when nothing new was
   * found; `null` only when the whole chain (or the whole range) is empty.
   */
  readonly checkpoint: AuditChainPoint | null
  readonly entriesChecked: number
}

export interface AuditPruneResult {
  readonly prunedCount: number
  /** The new genesis anchor — `null` only when nothing matched `olderThan`. */
  readonly genesis: AuditChainPoint | null
}

export interface AuditLog {
  record(input: RecordAuditInput): Promise<AuditEntry>
  list(filter?: AuditFilter): Promise<readonly AuditEntry[]>
  /** One entry by id, or `null` — the detail view's lookup (fiche 21 task 1). */
  get(id: string): Promise<AuditEntry | null>
  /** Recomputes every hash and compares, from the oldest surviving entry. Throws `AUDIT_CHAIN_BROKEN` naming the first mismatch. */
  verify(): Promise<void>
  /**
   * The bounded form `verify()` is built on: recomputes only entries at or
   * after `since` (the whole surviving chain when `since` is `null`), after
   * first confirming `since` itself still matches what is stored — an
   * altered or vanished checkpoint is exactly as much a break as an altered
   * row in the middle ever was, unless it vanished because of a recorded
   * `prune()`, which is not tampering and must not be reported as some.
   */
  verifyRange(since: AuditChainPoint | null): Promise<AuditVerifyRangeResult>
  /**
   * Deletes every entry strictly older than `olderThan` (ISO-8601), for
   * real — fiche 21 task 5's GDPR exit. Refuses (throwing
   * `AUDIT_CHAIN_BROKEN`) if the segment about to be removed does not
   * itself verify first: purging into an already-broken chain would erase
   * the evidence of the break, not just old rows.
   */
  prune(olderThan: string): Promise<AuditPruneResult>
}

/**
 * Who or what an entry names, read from signals the log already carries —
 * no schema change needed to answer "human or agent or key or system"
 * (fiche 21 task 4, "vérifier ce que le modèle porte déjà avant d'ajouter un
 * champ"):
 *  - `actorId === null` → `'system'` (nobody was signed in — a migration, a
 *    scheduled job).
 *  - `actorId` starts with `apikey:` → `'api_key'`. `resolveActor`
 *    (`packages/api/src/rest/auth-router.ts`) has prefixed every API-key
 *    actor's id this way since L13 task 8; nothing else produces that shape.
 *  - `action` starts with `agent.tool.` → `'agent'`. `withAudit`
 *    (`packages/agents/src/audit/with-audit.ts`, L4 task 6) is the only
 *    writer that names an action this way.
 *  - anything else → `'human'`.
 */
export function classifyAuditActor(entry: Pick<AuditEntry, 'actorId' | 'action'>): AuditActorKind {
  if (entry.actorId === null) return 'system'
  if (entry.actorId.startsWith('apikey:')) return 'api_key'
  if (entry.action.startsWith('agent.tool.')) return 'agent'
  return 'human'
}

function actorKindCondition(kind: AuditActorKind) {
  switch (kind) {
    case 'system':
      return sql`actor_id is null`
    case 'api_key':
      return sql`actor_id like ${'apikey:%'}`
    case 'agent':
      return sql`action like ${'agent.tool.%'}`
    case 'human':
      return sql`(actor_id is not null and actor_id not like ${'apikey:%'} and action not like ${'agent.tool.%'})`
  }
}

function chainBroken(entryId: string, reason: 'edited' | 'discontinuous'): CogentaError {
  return reason === 'discontinuous'
    ? new CogentaError({
        code: 'AUDIT_CHAIN_BROKEN',
        message: `Audit entry ${entryId} does not chain from the entry before it.`,
        hint: 'The audit log has been edited or reordered outside of record(). Treat every entry from this point on as untrusted.',
        details: { entryId },
      })
    : new CogentaError({
        code: 'AUDIT_CHAIN_BROKEN',
        message: `Audit entry ${entryId} has been modified since it was recorded.`,
        hint: 'Its stored hash no longer matches its content. Treat every entry from this point on as untrusted.',
        details: { entryId },
      })
}

export function createAuditLog(db: DatabaseHandle, now: () => number = Date.now): AuditLog {
  const table = identifier(TABLES.auditLog, db.dialect)
  const genesisTable = identifier(TABLES.auditGenesis, db.dialect)

  // Serialises appends within this process. Two concurrent writers computing
  // "the current last hash" from a read that has not committed yet would
  // both chain to the same previous hash and fork the chain — a database
  // transaction alone does not stop that on every dialect's default isolation
  // level, so the invariant is enforced here, once, rather than trusted to
  // whichever caller remembers to lock. `prune()` joins the same queue: a
  // purge running concurrently with an append is exactly the same class of
  // race, just over a delete instead of an insert.
  let appendQueue: Promise<unknown> = Promise.resolve()

  async function lastHash(): Promise<string | null> {
    const result = await db.query<{ hash: string }>(
      sql`select hash from ${table} order by at desc, id desc limit ${1}`,
    )
    return result.rows[0]?.hash ?? null
  }

  async function currentGenesis(): Promise<AuditChainPoint | null> {
    const result = await db.query<{ entry_id: string; entry_at: string; entry_hash: string }>(
      sql`select entry_id, entry_at, entry_hash from ${genesisTable} where id = ${'singleton'}`,
    )
    const row = result.rows[0]
    return row === undefined ? null : { id: row.entry_id, at: row.entry_at, hash: row.entry_hash }
  }

  /** `rows` must already be in `(at, id)` ascending order. */
  function verifyRows(
    rows: readonly AuditRow[],
    expectedPreviousStart: string | null,
  ): AuditChainPoint | null {
    let expectedPrevious = expectedPreviousStart
    let last: AuditChainPoint | null = null

    for (const row of rows) {
      if (row.previous_hash !== expectedPrevious) throw chainBroken(row.id, 'discontinuous')

      const { hash, version: _version, ...rest } = row
      if (computeHash(row.previous_hash, rest) !== hash) throw chainBroken(row.id, 'edited')

      expectedPrevious = hash
      last = { id: row.id, at: row.at, hash: row.hash }
    }

    return last
  }

  async function verifyRangeImpl(since: AuditChainPoint | null): Promise<AuditVerifyRangeResult> {
    const genesis = await currentGenesis()

    if (since === null) {
      const rows = await db.query<AuditRow>(sql`select * from ${table} order by at asc, id asc`)
      const last = verifyRows(rows.rows, genesis?.hash ?? null)
      return { checkpoint: last, entriesChecked: rows.rows.length }
    }

    const found = await db.query<AuditRow>(sql`select * from ${table} where id = ${since.id}`)
    const checkpointRow = found.rows[0]

    if (checkpointRow === undefined) {
      // Missing is only innocent when it is exactly what a recorded prune()
      // would leave behind: `since` at or before the current genesis. Newer
      // than the genesis (or no genesis at all) and still missing means
      // something else deleted it — tampering, not retention.
      const explainedByPrune =
        genesis !== null &&
        (since.at < genesis.at || (since.at === genesis.at && since.id <= genesis.id))
      if (!explainedByPrune) throw chainBroken(since.id, 'discontinuous')

      // Resume as if starting fresh from the genesis: everything between the
      // old checkpoint and the genesis is gone by design, and the caller's
      // next checkpoint should be the genesis or later.
      const rows = await db.query<AuditRow>(sql`select * from ${table} order by at asc, id asc`)
      const last = verifyRows(rows.rows, genesis?.hash ?? null)
      return { checkpoint: last ?? genesis, entriesChecked: rows.rows.length }
    }

    if (checkpointRow.hash !== since.hash) throw chainBroken(since.id, 'edited')
    // Defence in depth: the checkpoint row's own stored hash must still
    // match its own content, not only match what the caller remembered.
    const { hash, version: _version, ...rest } = checkpointRow
    if (computeHash(checkpointRow.previous_hash, rest) !== hash) {
      throw chainBroken(since.id, 'edited')
    }

    const rows = await db.query<AuditRow>(
      sql`select * from ${table}
          where (at > ${since.at}) or (at = ${since.at} and id > ${since.id})
          order by at asc, id asc`,
    )
    const last = verifyRows(rows.rows, since.hash)
    return { checkpoint: last ?? since, entriesChecked: rows.rows.length }
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
        const version = input.version === undefined ? null : String(input.version)

        await db.query(sql`
          insert into ${table} (id, at, actor_id, actor_roles, action, collection_name, entry_id, diff, hash, previous_hash, version)
          values (${base.id}, ${base.at}, ${base.actor_id}, ${base.actor_roles}, ${base.action},
                  ${base.collection_name}, ${base.entry_id}, ${base.diff}, ${hash}, ${base.previous_hash}, ${version})`)

        return fromRow({ ...base, hash, version })
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
      if (filter.until !== undefined) conditions.push(sql`at <= ${filter.until}`)
      if (filter.actorKind !== undefined) conditions.push(actorKindCondition(filter.actorKind))
      if (filter.before !== undefined) {
        conditions.push(
          sql`(at < ${filter.before.at} or (at = ${filter.before.at} and id < ${filter.before.id}))`,
        )
      }

      const where = conditions.reduce((left, right) => sql`${left} and ${right}`)
      const result = await db.query<AuditRow>(sql`
        select * from ${table} where ${where} order by at desc, id desc limit ${filter.limit ?? 200}`)
      return result.rows.map(fromRow)
    },

    get: async (id) => {
      const result = await db.query<AuditRow>(sql`select * from ${table} where id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : fromRow(row)
    },

    verify: async () => {
      await verifyRangeImpl(null)
    },

    verifyRange: (since) => verifyRangeImpl(since),

    prune: (olderThan) => {
      const task = appendQueue.then(async (): Promise<AuditPruneResult> => {
        const candidates = await db.query<AuditRow>(
          sql`select * from ${table} where at < ${olderThan} order by at asc, id asc`,
        )
        if (candidates.rows.length === 0) {
          return { prunedCount: 0, genesis: await currentGenesis() }
        }

        const genesis = await currentGenesis()
        // Throws `AUDIT_CHAIN_BROKEN` when the segment about to be removed
        // is already discontinuous or edited — refusing to purge over
        // evidence of tampering, rather than quietly making it unrecoverable.
        const anchor = verifyRows(candidates.rows, genesis?.hash ?? null)
        if (anchor === null) {
          // Unreachable: `candidates.rows.length > 0` guarantees `verifyRows`
          // returns the last row it processed. Narrows the type for below.
          throw chainBroken('unknown', 'discontinuous')
        }

        await db.transaction(async (tx) => {
          await tx.query(sql`delete from ${table} where at < ${olderThan}`)
          await tx.query(sql`delete from ${genesisTable} where id = ${'singleton'}`)
          await tx.query(sql`
            insert into ${genesisTable} (id, entry_id, entry_at, entry_hash, pruned_count, pruned_at)
            values (${'singleton'}, ${anchor.id}, ${anchor.at}, ${anchor.hash},
                    ${String(candidates.rows.length)}, ${new Date(now()).toISOString()})`)
        })

        return { prunedCount: candidates.rows.length, genesis: anchor }
      })

      appendQueue = task.catch(() => undefined)
      return task
    },
  }
}
