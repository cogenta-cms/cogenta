import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  type Logger,
  limit,
  newId,
  sql,
} from '@cogenta/core'

/**
 * The scheduled-task registry (fiche 28 task 1).
 *
 * Before this, `cogenta serve` registered four unrelated pieces of recurring
 * work — scheduled publication, the 404 log purge, the audit-integrity
 * check, the trash sweep — each on its own bare `setInterval`, with no shared
 * bookkeeping. Nothing recorded whether a run had happened, how long it took,
 * or whether it had failed; the only way to know a scheduled publication had
 * stopped working was a reader noticing a page never went live.
 *
 * A registered task declares a name, a description, an interval and a
 * function. This module owns everything else: running due tasks, recording
 * every run, and answering "what is scheduled, and did it work" for the
 * admin screen fiche 28 task 2 builds over it.
 *
 * **Persistence is the point of task 3.** A task's "last run" is a row in
 * this table, not a variable in the process — a `setInterval` handle dies
 * with the process, and a site restarted after being down all night must be
 * able to say, immediately, "the trash sweep has not run in fourteen hours"
 * rather than resetting the clock the moment it comes back up. `tick()`
 * itself is equally indifferent to *why* it is being called: `cogenta
 * serve`'s own loop and the one-shot `cogenta cron` command both just call
 * it, which is what makes the second a real alternative to the first rather
 * than a separate reimplementation (fiche 28 task 5).
 */

export const SCHEDULED_TASK_RUNS_TABLE = 'cogenta_scheduled_task_runs'
/**
 * One row per task: the compare-and-set lock `tick()` claims before running a
 * task (L22 task 6). Kept separate from the run-history table above —
 * history answers "what happened", this answers "is anyone already doing
 * this right now", and conflating the two would make every read of the
 * admin history screen reason about lock state.
 *
 * Before this table existed, `tick()` read the last run from the history
 * table, decided a task was due, and only recorded the new run *after* it
 * finished — nothing made that read-then-act atomic. With more than one
 * `cogenta serve` replica (or a replica racing a `cogenta cron` invocation)
 * against the same database, two processes could both read "due" and both
 * start executing the same task, including the destructive trash-purge
 * sweep. The fix is the same shape as `takeOne`'s guarded stock `UPDATE` in
 * `@cogenta/commerce` and `claimOnce`'s guarded job `UPDATE` in
 * `@cogenta/core`'s database queue: read `last_claim`, then issue a single
 * `UPDATE ... WHERE last_claim = <the value just read>`. Only one of two
 * racing `UPDATE`s can match that `WHERE` — the loser sees
 * `rowsAffected === 0` and skips the task entirely. No dialect-specific
 * locking primitive is needed: a single `UPDATE` with an equality `WHERE` is
 * atomic per row on SQLite, Postgres and MySQL/MariaDB alike, so the exact
 * same query runs unmodified on all three.
 */
export const SCHEDULED_TASK_CLAIMS_TABLE = 'cogenta_scheduled_task_claims'

/** Runs kept per task. Enough to see a pattern across a week of daily tasks, never unbounded. */
const DEFAULT_KEEP_RUNS = 50

export type TaskTrigger = 'schedule' | 'manual' | 'cron'
export type TaskOutcome = 'success' | 'error'

export interface ScheduledTaskRun {
  readonly id: string
  readonly taskName: string
  /** Epoch milliseconds. */
  readonly startedAt: number
  /** Epoch milliseconds. */
  readonly finishedAt: number
  readonly durationMs: number
  readonly outcome: TaskOutcome
  readonly summary: string | null
  readonly error: string | null
  readonly triggeredBy: TaskTrigger
  /** Who clicked "run now", when `triggeredBy` is `'manual'`. Never set otherwise. */
  readonly actor: string | null
}

export interface ScheduledTaskOutcome {
  /** A short, human-readable result — "3 published", "12 purged". Shown next to the run in the admin screen. */
  readonly summary?: string
}

export interface ScheduledTaskDefinition {
  /** Stable, used as the id everywhere — in the run table, in the admin screen's URL, in `runNow`. Never shown untranslated as the only label (`description` is). */
  readonly name: string
  readonly description: string
  readonly intervalMs: number
  /**
   * True for a task whose manual run destroys something irrecoverable (the
   * trash sweep, most of all) — the admin screen's "run now" button asks for
   * confirmation before calling it (fiche 28 task 2/piège: "«Exécuter
   * maintenant» sur une purge est destructif").
   */
  readonly destructive?: boolean
  readonly run: () => Promise<ScheduledTaskOutcome | undefined>
}

export interface ScheduledTaskState {
  readonly name: string
  readonly description: string
  readonly intervalMs: number
  readonly destructive: boolean
  readonly lastRun: ScheduledTaskRun | null
  /** Epoch milliseconds: when this task next becomes due. `lastRun`'s instant plus its interval, or "now" if it has never run. */
  readonly nextRunAt: number
  /**
   * True once a task is more than twice its own interval past due (fiche 28
   * task 3) — including a task that has never run at all, which is the state
   * an external cron that was configured but never actually invoked leaves
   * every task in forever.
   */
  readonly overdue: boolean
  /** Most recent first, bounded to `keepRuns`. */
  readonly recentRuns: readonly ScheduledTaskRun[]
}

export interface ScheduledTaskRegistry {
  /** Declares a task. Registering the same name twice is a configuration bug, refused loudly rather than silently overwriting the first. */
  register(definition: ScheduledTaskDefinition): void
  /** Every registered task's current state, in registration order. */
  list(): Promise<readonly ScheduledTaskState[]>
  get(name: string): Promise<ScheduledTaskState | null>
  /**
   * Runs one task regardless of whether it is due, and records the run.
   * Never rejects on the task's own failure — the run is recorded with
   * `outcome: 'error'` and returned, not thrown, so a caller (the admin
   * "run now" route, `tick()` itself) never needs a second error path for
   * "the task ran and failed" versus "calling it failed".
   */
  runNow(name: string, options?: { readonly actor?: string | null }): Promise<ScheduledTaskRun>
  /**
   * Runs every task whose interval has elapsed since its last run, in
   * registration order and one at a time — never concurrently, so two tasks
   * sharing one SQLite connection never open overlapping transactions.
   *
   * Each due task is first claimed with a compare-and-set `UPDATE` against
   * `SCHEDULED_TASK_CLAIMS_TABLE`. Losing that race (another replica already
   * claimed the same task) is not an error — the task is silently skipped
   * for this tick, exactly as if it had not been due.
   */
  tick(now?: number): Promise<{ readonly ran: readonly string[] }>
  ensureTable(): Promise<void>
}

export interface CreateScheduledTaskRegistryOptions {
  readonly db: DatabaseHandle
  readonly logger?: Logger
  readonly now?: () => number
  /** Runs kept per task before older ones are pruned. Defaults to 50. */
  readonly keepRuns?: number
  readonly table?: string
  /** Defaults to `SCHEDULED_TASK_CLAIMS_TABLE`. */
  readonly claimsTable?: string
}

interface RunRow {
  id: string
  task_name: string
  started_at: number
  finished_at: number
  duration_ms: number
  outcome: string
  summary: string | null
  error: string | null
  triggered_by: string
  actor: string | null
}

interface ClaimRow {
  task_name: string
  last_claim: number | null
}

function toRun(row: RunRow): ScheduledTaskRun {
  return {
    id: row.id,
    taskName: row.task_name,
    startedAt: Number(row.started_at),
    finishedAt: Number(row.finished_at),
    durationMs: Number(row.duration_ms),
    outcome: row.outcome as TaskOutcome,
    summary: row.summary,
    error: row.error,
    triggeredBy: row.triggered_by as TaskTrigger,
    actor: row.actor,
  }
}

function unknownTask(name: string): CogentaError {
  return new CogentaError({
    code: 'SCHEDULER_TASK_UNKNOWN',
    message: `No scheduled task named "${name}" is registered.`,
    hint: 'Check the task name against GET /api/scheduled-tasks — a task only appears there once something has called register() for it.',
    details: { name },
  })
}

export function createScheduledTaskRegistry(
  options: CreateScheduledTaskRegistryOptions,
): ScheduledTaskRegistry {
  const { db } = options
  const now = options.now ?? Date.now
  const keepRuns = options.keepRuns ?? DEFAULT_KEEP_RUNS
  const logger = options.logger?.child({ component: 'scheduler' })
  const table = identifier(options.table ?? SCHEDULED_TASK_RUNS_TABLE, db.dialect)
  const claimsTable = identifier(options.claimsTable ?? SCHEDULED_TASK_CLAIMS_TABLE, db.dialect)

  const definitions = new Map<string, ScheduledTaskDefinition>()
  let ready = false

  async function ensureTable(): Promise<void> {
    if (ready) return
    await db.query(sql`
      create table if not exists ${table} (
        id varchar(64) not null primary key,
        task_name varchar(255) not null,
        started_at bigint not null,
        finished_at bigint not null,
        duration_ms bigint not null,
        outcome varchar(16) not null,
        summary text,
        error text,
        triggered_by varchar(16) not null,
        actor varchar(255)
      )`)
    await db
      .query(
        sql`create index ${identifier('cogenta_scheduled_task_runs_task', db.dialect)}
            on ${table} (task_name, started_at)`,
      )
      .catch(() => undefined) // already there

    // The compare-and-set lock table (L22 task 6). `last_claim` starts out
    // `null` — "never claimed" — for a brand-new row, matching the meaning
    // `lastRunFor` gives a task that has never run.
    await db.query(sql`
      create table if not exists ${claimsTable} (
        task_name varchar(255) not null primary key,
        last_claim bigint
      )`)
    ready = true
  }

  async function lastRunFor(name: string): Promise<ScheduledTaskRun | null> {
    await ensureTable()
    const found = await db.query<RunRow>(sql`
      select id, task_name, started_at, finished_at, duration_ms, outcome, summary, error, triggered_by, actor
      from ${table}
      where task_name = ${name}
      order by started_at desc
      limit ${limit(1)}`)
    const row = found.rows[0]
    return row === undefined ? null : toRun(row)
  }

  async function recentRunsFor(name: string): Promise<readonly ScheduledTaskRun[]> {
    await ensureTable()
    const found = await db.query<RunRow>(sql`
      select id, task_name, started_at, finished_at, duration_ms, outcome, summary, error, triggered_by, actor
      from ${table}
      where task_name = ${name}
      order by started_at desc
      limit ${limit(keepRuns)}`)
    return found.rows.map(toRun)
  }

  async function pruneOldRuns(name: string): Promise<void> {
    // Keep the newest `keepRuns`, drop the rest — bounded history without a
    // separate cleanup task of its own.
    const kept = await db.query<{ id: string }>(sql`
      select id from ${table}
      where task_name = ${name}
      order by started_at desc
      limit ${limit(keepRuns)}`)
    if (kept.rows.length < keepRuns) return

    const keptIds = kept.rows.map((row) => row.id)
    const inList = keptIds.map((id) => sql`${id}`).reduce((left, right) => sql`${left}, ${right}`)
    await db.query(sql`delete from ${table} where task_name = ${name} and id not in (${inList})`)
  }

  /**
   * Makes sure a claim row exists for a task, seeded from the run history so
   * an upgrade from a database that already has runs (but no claims table
   * yet) does not make every existing task look newly-never-run and fire
   * immediately. A race between two processes both seeding the same row for
   * the first time is harmless: the loser's `insert` hits the primary key
   * and is swallowed, exactly like the "already there" index-creation guard
   * above — the row itself, not who created it, is what matters.
   */
  async function ensureClaimRow(name: string): Promise<void> {
    await ensureTable()
    const existing = await db.query<{ task_name: string }>(
      sql`select task_name from ${claimsTable} where task_name = ${name}`,
    )
    if (existing.rows.length > 0) return

    const priorRun = await lastRunFor(name)
    const seed = priorRun === null ? null : priorRun.startedAt
    await db
      .query(sql`insert into ${claimsTable} (task_name, last_claim) values (${name}, ${seed})`)
      .catch(() => undefined) // another process seeded it first — fine, the row exists either way
  }

  /**
   * The compare-and-set claim `tick()` takes before running a due task.
   *
   * Reads the task's current `last_claim`, decides whether that makes it
   * due, and — only if so — tries to move `last_claim` forward with a single
   * guarded `UPDATE` whose `WHERE` re-checks the exact value just read. If
   * another process already claimed this task between the read and the
   * write, `last_claim` no longer matches, `rowsAffected` comes back `0`,
   * and this returns `false` — the caller must not run the task. Only one of
   * two racing callers can ever see `true` for the same task and instant,
   * because a single-row `UPDATE` with an equality `WHERE` is atomic on
   * SQLite, Postgres and MySQL/MariaDB alike; nothing dialect-specific is
   * needed here.
   */
  async function tryClaim(definition: ScheduledTaskDefinition, at: number): Promise<boolean> {
    await ensureClaimRow(definition.name)

    const found = await db.query<ClaimRow>(
      sql`select task_name, last_claim from ${claimsTable} where task_name = ${definition.name}`,
    )
    // Normalised the same way `toRun` normalises the run-history table's
    // bigint columns: drivers disagree on whether a bigint column comes back
    // as a JS number, a string or a `bigint`, and comparing/subtracting the
    // wrong one silently produces `NaN` or a string mismatch rather than an
    // error.
    const raw = found.rows[0]?.last_claim
    const lastClaim = raw === null || raw === undefined ? null : Number(raw)
    const due = lastClaim === null || at - lastClaim >= definition.intervalMs
    if (!due) return false

    const result =
      lastClaim === null
        ? await db.query(sql`
            update ${claimsTable} set last_claim = ${at}
            where task_name = ${definition.name} and last_claim is null`)
        : await db.query(sql`
            update ${claimsTable} set last_claim = ${at}
            where task_name = ${definition.name} and last_claim = ${lastClaim}`)

    return result.rowsAffected > 0
  }

  /**
   * Keeps the claim row in step with the run it just recorded, whether the
   * run was scheduled or manual (`runNow`) — a manual run must push the next
   * scheduled run out exactly as it always has, since `tick()` used to base
   * "is it due" on the run-history table, which every trigger writes to.
   */
  async function upsertClaim(name: string, startedAt: number): Promise<void> {
    await ensureClaimRow(name)
    await db.query(
      sql`update ${claimsTable} set last_claim = ${startedAt} where task_name = ${name}`,
    )
  }

  async function stateFor(definition: ScheduledTaskDefinition): Promise<ScheduledTaskState> {
    const lastRun = await lastRunFor(definition.name)
    const at = now()
    const nextRunAt = lastRun === null ? at : lastRun.startedAt + definition.intervalMs
    const overdue = lastRun === null ? true : at - lastRun.startedAt > definition.intervalMs * 2

    return {
      name: definition.name,
      description: definition.description,
      intervalMs: definition.intervalMs,
      destructive: definition.destructive ?? false,
      lastRun,
      nextRunAt,
      overdue,
      recentRuns: await recentRunsFor(definition.name),
    }
  }

  async function execute(
    definition: ScheduledTaskDefinition,
    triggeredBy: TaskTrigger,
    actor: string | null,
  ): Promise<ScheduledTaskRun> {
    await ensureTable()
    const startedAt = now()

    let outcome: TaskOutcome = 'success'
    let summary: string | null = null
    let error: string | null = null

    try {
      const result = await definition.run()
      summary = result?.summary ?? null
    } catch (caught) {
      outcome = 'error'
      error = caught instanceof Error ? caught.message : String(caught)
      logger?.error('scheduled task failed', { task: definition.name, error })
    }

    const finishedAt = now()
    const run: ScheduledTaskRun = {
      id: newId(now),
      taskName: definition.name,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, finishedAt - startedAt),
      outcome,
      summary,
      error,
      triggeredBy,
      actor,
    }

    await db.query(sql`
      insert into ${table}
        (id, task_name, started_at, finished_at, duration_ms, outcome, summary, error, triggered_by, actor)
      values
        (${run.id}, ${run.taskName}, ${run.startedAt}, ${run.finishedAt}, ${run.durationMs},
         ${run.outcome}, ${run.summary}, ${run.error}, ${run.triggeredBy}, ${run.actor})`)
    await pruneOldRuns(definition.name)
    await upsertClaim(definition.name, run.startedAt)

    return run
  }

  return {
    register: (definition) => {
      if (definitions.has(definition.name)) {
        throw new CogentaError({
          code: 'SCHEDULER_TASK_DUPLICATE',
          message: `A scheduled task named "${definition.name}" is already registered.`,
          hint: 'Task names must be unique. Pick a different name, or remove the duplicate registration.',
          details: { name: definition.name },
        })
      }
      definitions.set(definition.name, definition)
    },

    list: async () => {
      const states: ScheduledTaskState[] = []
      for (const definition of definitions.values()) {
        states.push(await stateFor(definition))
      }
      return states
    },

    get: async (name) => {
      const definition = definitions.get(name)
      return definition === undefined ? null : stateFor(definition)
    },

    runNow: async (name, runOptions = {}) => {
      const definition = definitions.get(name)
      if (definition === undefined) throw unknownTask(name)
      return execute(definition, 'manual', runOptions.actor ?? null)
    },

    tick: async (at = now()) => {
      const ran: string[] = []
      // Sequenced, not concurrent within this process: this may share one
      // SQLite connection with whatever else calls `db.transaction`, which
      // cannot have two writers open at the same instant. Across processes,
      // `tryClaim` is what actually prevents two replicas from both running
      // the same task — this loop alone would not (L22 task 6).
      for (const definition of definitions.values()) {
        const claimed = await tryClaim(definition, at)
        if (!claimed) continue
        await execute(definition, 'schedule', null)
        ran.push(definition.name)
      }
      return { ran }
    },

    ensureTable,
  }
}
