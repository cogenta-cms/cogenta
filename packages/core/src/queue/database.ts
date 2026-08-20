import { randomUUID } from 'node:crypto'
import process from 'node:process'
import {
  type DatabaseHandle,
  identifier,
  limit,
  type SqlExecutor,
  sql,
  unsafeRaw,
} from '../db/index.js'
import { CogentaError } from '../errors/index.js'
import { createLogger, type Logger } from '../logger/index.js'
import type {
  EnqueueOptions,
  Job,
  JobHandler,
  JobId,
  JobState,
  ListJobsOptions,
  QueueDriver,
  QueueDriverOptions,
} from './types.js'

const TABLE = 'cogenta_jobs'
const DEFAULT_LEASE_MS = 5 * 60 * 1000
const DEFAULT_BATCH_SIZE = 10
const MAX_BACKOFF_MS = 60_000

export interface DatabaseQueueOptions extends QueueDriverOptions {
  readonly db: DatabaseHandle
  readonly logger?: Logger
}

interface JobRow {
  id: string
  name: string
  payload: string | null
  attempt: number
  max_attempts: number
}

interface JobStateRow {
  id: string
  name: string
  status: string
  attempt: number
  max_attempts: number
  run_at: number
  last_error: string | null
}

function toJobState(row: JobStateRow): JobState {
  return {
    id: row.id,
    name: row.name,
    status: row.status as JobState['status'],
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    runAt: Number(row.run_at),
    lastError: row.last_error ?? undefined,
  }
}

/** Exponential, capped. A failing job must not retry in a tight loop. */
function backoffMs(attempt: number): number {
  return Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS)
}

const CLAIM_ATTEMPTS = 5

/**
 * Deadlocks and serialisation failures are normal under contention, not bugs.
 *
 * InnoDB detects a cycle between two claim transactions and kills one of them;
 * Postgres reports a serialisation failure for the same situation. Both
 * databases document the remedy as "retry the transaction", so that is what the
 * claim does — silently, because a worker losing a race is not an incident.
 */
function isRetryableConflict(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } }).cause?.code ?? ''
  if (code === 'ER_LOCK_DEADLOCK' || code === '40001' || code === '40P01') return true

  return /deadlock|could not serialize/i.test(
    error instanceof Error ? error.message : String(error),
  )
}

/**
 * The degraded job queue: a SQL table, drained by whoever calls `tick()` — a
 * system cron on shared hosting, a loop in a long-lived process elsewhere.
 *
 * Its whole reason to exist is rule R1: a Cogenta install must work with no
 * Redis and no persistent worker. That makes correctness under concurrency
 * non-negotiable, because this is the driver most sites will actually run.
 */
export function createDatabaseQueue(options: DatabaseQueueOptions): QueueDriver {
  const { db } = options
  const now = options.now ?? Date.now
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
  const logger = (options.logger ?? createLogger()).child({ component: 'queue' })
  const worker = `${process.pid}-${randomUUID().slice(0, 8)}`

  const handlers = new Map<string, JobHandler<never>>()
  const table = identifier(TABLE, db.dialect)
  let ready = false

  // Postgres, MySQL 8 and MariaDB 10.6+ can skip rows another transaction has
  // locked. SQLite cannot, and does not need to: BEGIN IMMEDIATE serialises
  // writers, so only one claim runs at a time.
  const skipLocked = db.dialect === 'sqlite' ? unsafeRaw('') : unsafeRaw('for update skip locked')

  async function ensureTable(): Promise<void> {
    if (ready) return
    await db.query(sql`
      create table if not exists ${table} (
        id varchar(64) not null primary key,
        name varchar(255) not null,
        payload text,
        status varchar(16) not null,
        attempt integer not null,
        max_attempts integer not null,
        priority integer not null,
        run_at bigint not null,
        locked_until bigint,
        locked_by varchar(255),
        last_error text
      )`)

    // The index the claim query lives on. Without it, every tick scans the
    // whole table, which is fine at ten jobs and fatal at a hundred thousand.
    await db
      .query(
        sql`create index ${identifier('cogenta_jobs_claim', db.dialect)}
            on ${table} (status, run_at)`,
      )
      .catch(() => undefined) // already there

    ready = true
  }

  async function claim(names: readonly string[]): Promise<Job[]> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await claimOnce(names)
      } catch (error) {
        if (attempt >= CLAIM_ATTEMPTS || !isRetryableConflict(error)) throw error
        logger.debug('claim lost a race, retrying', { attempt })
      }
    }
  }

  async function claimOnce(names: readonly string[]): Promise<Job[]> {
    if (names.length === 0) return []

    const at = now()
    const nameList = names.map((name) => sql`${name}`)
    const inList = nameList.reduce((left, right) => sql`${left}, ${right}`)

    return db.transaction(
      async (tx: SqlExecutor) => {
        const found = await tx.query<JobRow>(sql`
          select id, name, payload, attempt, max_attempts
          from ${table}
          where status = ${'pending'}
            and run_at <= ${at}
            and name in (${inList})
          order by priority desc, run_at asc
          limit ${limit(batchSize)}
          ${skipLocked}`)

        const claimed: Job[] = []
        for (const row of found.rows) {
          const attempt = Number(row.attempt) + 1
          const updated = await tx.query(sql`
            update ${table}
            set status = ${'running'},
                attempt = ${attempt},
                locked_by = ${worker},
                locked_until = ${at + leaseMs}
            where id = ${row.id} and status = ${'pending'}`)

          // On SQLite the write lock makes this always true. Elsewhere it is the
          // second gate: if another worker got there first, we skip the job
          // rather than run it twice.
          if (updated.rowsAffected === 0) continue

          claimed.push({
            id: row.id,
            name: row.name,
            payload: row.payload === null ? null : JSON.parse(row.payload),
            attempt,
            maxAttempts: Number(row.max_attempts),
          })
        }
        return claimed
      },
      { immediate: true },
    )
  }

  /** Returns an expired lease to the pool: the worker holding it is gone. */
  async function reclaimExpired(): Promise<void> {
    await db.query(sql`
      update ${table}
      set status = ${'pending'}, locked_by = ${null}, locked_until = ${null}
      where status = ${'running'} and locked_until is not null and locked_until <= ${now()}`)
  }

  async function succeed(job: Job): Promise<void> {
    await db.query(sql`
      update ${table}
      set status = ${'completed'}, locked_by = ${null}, locked_until = ${null}
      where id = ${job.id}`)
  }

  async function fail(job: Job, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    const exhausted = job.attempt >= job.maxAttempts

    await db.query(sql`
      update ${table}
      set status = ${exhausted ? 'failed' : 'pending'},
          run_at = ${exhausted ? now() : now() + backoffMs(job.attempt)},
          locked_by = ${null},
          locked_until = ${null},
          last_error = ${message}
      where id = ${job.id}`)

    logger.warn(exhausted ? 'job failed for good' : 'job failed, will retry', {
      id: job.id,
      name: job.name,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
    })
  }

  return {
    enqueue: async (enqueueOptions: EnqueueOptions): Promise<JobId> => {
      await ensureTable()

      if (enqueueOptions.name.length === 0) {
        throw new CogentaError({
          code: 'QUEUE_FAILED',
          message: 'A job must have a name.',
          hint: 'The name is what routes the job to a handler registered with process().',
        })
      }

      const id = randomUUID()
      await db.query(sql`
        insert into ${table} (id, name, payload, status, attempt, max_attempts, priority, run_at)
        values (${id}, ${enqueueOptions.name},
                ${JSON.stringify(enqueueOptions.payload ?? null)},
                ${'pending'}, ${0}, ${enqueueOptions.maxAttempts ?? 3},
                ${enqueueOptions.priority ?? 0}, ${enqueueOptions.runAt ?? now()})`)

      return id
    },

    process: <TPayload>(name: string, handler: JobHandler<TPayload>): void => {
      if (handlers.has(name)) {
        throw new CogentaError({
          code: 'QUEUE_FAILED',
          message: `A handler is already registered for jobs named "${name}".`,
          hint: 'One handler per job name. Register a different name, or compose inside the existing handler.',
        })
      }
      handlers.set(name, handler as JobHandler<never>)
    },

    tick: async (): Promise<number> => {
      await ensureTable()
      await reclaimExpired()

      // Only jobs this process can actually handle are claimed. Two workers with
      // different handlers each take their own work instead of locking jobs they
      // would have to put back.
      const claimed = await claim([...handlers.keys()])

      for (const job of claimed) {
        const handler = handlers.get(job.name)
        if (handler === undefined) continue

        try {
          await handler(job as never)
          await succeed(job)
        } catch (error) {
          await fail(job, error)
        }
      }

      return claimed.length
    },

    cancel: async (id: JobId): Promise<void> => {
      await ensureTable()
      // A running job is left alone: cancelling it here would only lose track of
      // work that is still happening in another process.
      await db.query(sql`
        update ${table} set status = ${'cancelled'}
        where id = ${id} and status = ${'pending'}`)
    },

    status: async (id: JobId): Promise<JobState | null> => {
      await ensureTable()
      const result = await db.query<JobStateRow>(sql`
        select id, name, status, attempt, max_attempts, run_at, last_error
        from ${table} where id = ${id}`)

      const row = result.rows[0]
      return row === undefined ? null : toJobState(row)
    },

    list: async (listOptions: ListJobsOptions = {}): Promise<readonly JobState[]> => {
      await ensureTable()
      const statusFilter =
        listOptions.status === undefined ? sql`1 = 1` : sql`status = ${listOptions.status}`

      const result = await db.query<JobStateRow>(sql`
        select id, name, status, attempt, max_attempts, run_at, last_error
        from ${table}
        where ${statusFilter}
        order by run_at desc
        limit ${limit(listOptions.limit ?? 50)}`)

      return result.rows.map(toJobState)
    },

    retry: async (id: JobId): Promise<boolean> => {
      await ensureTable()
      const result = await db.query(sql`
        update ${table}
        set status = ${'pending'}, attempt = ${0}, run_at = ${now()}, last_error = ${null},
            locked_by = ${null}, locked_until = ${null}
        where id = ${id} and status = ${'failed'}`)
      return result.rowsAffected > 0
    },

    close: async (): Promise<void> => {
      handlers.clear()
    },
  }
}
