import process from 'node:process'
import { type DatabaseHandle, identifier, type SqlExecutor, sql } from '../db/index.js'
import { CogentaError } from '../errors/index.js'
import { createLogger, type Logger } from '../logger/index.js'
import type {
  Migration,
  MigrationOutcome,
  MigrationRecord,
  MigrationStatus,
  RollbackOptions,
  RunOptions,
} from './types.js'

const TABLE = 'cogenta_migrations'
const LOCK_TABLE = 'cogenta_migrations_lock'
const LOCK_ROW = 1
const DEFAULT_STALE_LOCK_MS = 15 * 60 * 1000

export interface MigratorOptions {
  readonly db: DatabaseHandle
  readonly migrations: readonly Migration[]
  readonly logger?: Logger
  /** A lock older than this is assumed to belong to a process that died. */
  readonly staleLockMs?: number
  readonly now?: () => number
}

export interface Migrator {
  status(): Promise<MigrationStatus[]>
  up(options?: RunOptions): Promise<MigrationOutcome[]>
  down(options?: RollbackOptions): Promise<MigrationOutcome[]>
}

function sorted(migrations: readonly Migration[]): Migration[] {
  return [...migrations].sort((a, b) => a.id.localeCompare(b.id))
}

function assertUniqueIds(migrations: readonly Migration[]): void {
  const seen = new Set<string>()
  for (const migration of migrations) {
    if (seen.has(migration.id)) {
      throw new CogentaError({
        code: 'MIGRATION_FAILED',
        message: `Two migrations share the id "${migration.id}".`,
        hint: 'Migration ids must be unique and are never renumbered once applied.',
        details: { id: migration.id },
      })
    }
    seen.add(migration.id)
  }
}

export function createMigrator(options: MigratorOptions): Migrator {
  const { db, migrations } = options
  const logger = (options.logger ?? createLogger()).child({ component: 'migrator' })
  const now = options.now ?? Date.now
  const staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS
  const owner = `${process.pid}@${new Date(now()).toISOString()}`

  assertUniqueIds(migrations)
  const ordered = sorted(migrations)

  const table = identifier(TABLE, db.dialect)
  const lockTable = identifier(LOCK_TABLE, db.dialect)

  async function ensureTables(): Promise<void> {
    // Portable on purpose: varchar keys stay under the MySQL index length limit
    // in utf8mb4, and timestamps are ISO strings so the three dialects cannot
    // disagree about time zones in the one table that records history.
    await db.query(sql`
      create table if not exists ${table} (
        id varchar(255) not null primary key,
        name varchar(255) not null,
        checksum varchar(64),
        applied_at varchar(32) not null,
        duration_ms integer not null
      )`)

    await db.query(sql`
      create table if not exists ${lockTable} (
        id integer not null primary key,
        acquired_at varchar(32) not null,
        owner varchar(255) not null
      )`)
  }

  async function appliedRecords(): Promise<Map<string, MigrationRecord>> {
    const result = await db.query<{
      id: string
      name: string
      checksum: string | null
      applied_at: string
      duration_ms: number
    }>(sql`select id, name, checksum, applied_at, duration_ms from ${table} order by id`)

    return new Map(
      result.rows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          checksum: row.checksum,
          appliedAt: row.applied_at,
          durationMs: Number(row.duration_ms),
        },
      ]),
    )
  }

  /**
   * Takes an exclusive lock so two deployments cannot migrate at once.
   *
   * The primary key does the work: whoever inserts the row first wins, and the
   * loser gets a conflict rather than a half-applied schema. A lock older than
   * `staleLockMs` belonged to a process that died, and is taken over.
   */
  async function acquireLock(): Promise<void> {
    const cutoff = new Date(now() - staleLockMs).toISOString()
    await db.query(sql`delete from ${lockTable} where id = ${LOCK_ROW} and acquired_at < ${cutoff}`)

    try {
      await db.query(
        sql`insert into ${lockTable} (id, acquired_at, owner)
            values (${LOCK_ROW}, ${new Date(now()).toISOString()}, ${owner})`,
      )
    } catch (error) {
      throw new CogentaError({
        code: 'MIGRATION_LOCKED',
        message: 'Another process is already running migrations on this database.',
        hint: `Wait for it to finish. If a previous run crashed, the lock is released automatically after ${Math.round(staleLockMs / 60000)} minutes, or you can delete the row from ${LOCK_TABLE}.`,
        cause: error,
      })
    }
  }

  async function releaseLock(): Promise<void> {
    await db.query(sql`delete from ${lockTable} where id = ${LOCK_ROW} and owner = ${owner}`)
  }

  function assertAllowed(pending: readonly Migration[], run: RunOptions): void {
    const destructive = pending.filter((migration) => migration.destructive === true)
    if (destructive.length === 0) return

    if (run.confirmDestructive !== true || run.backupVerified !== true) {
      throw new CogentaError({
        code: 'MIGRATION_DESTRUCTIVE',
        message: `This run includes ${destructive.length} destructive migration(s): ${destructive
          .map((migration) => migration.id)
          .join(', ')}.`,
        hint: 'A destructive migration removes or rewrites data that its down() cannot restore. Take a backup, verify it restores, then re-run confirming both.',
        details: {
          migrations: destructive.map((migration) => ({
            id: migration.id,
            impact: migration.impact ?? 'not documented',
          })),
        },
      })
    }
  }

  /**
   * Runs one direction of one migration, in a transaction where the database
   * has transactional DDL.
   *
   * **MySQL does not.** A `CREATE TABLE` commits implicitly, so a migration that
   * fails halfway leaves the schema partly changed and no rollback happens. The
   * engine cannot fix that; it records the failure loudly so the operator knows
   * the schema is in between two states rather than believing it rolled back.
   */
  async function runOne(migration: Migration, direction: 'up' | 'down'): Promise<MigrationOutcome> {
    const startedAt = now()
    const name = migration.name ?? migration.id
    const transactionalDdl = db.dialect !== 'mysql'

    const body = async (tx: SqlExecutor): Promise<void> => {
      if (direction === 'up') {
        await migration.up(tx)
        await tx.query(
          sql`insert into ${table} (id, name, checksum, applied_at, duration_ms)
              values (${migration.id}, ${name}, ${migration.checksum ?? null},
                      ${new Date(now()).toISOString()}, ${now() - startedAt})`,
        )
      } else {
        await migration.down(tx)
        await tx.query(sql`delete from ${table} where id = ${migration.id}`)
      }
    }

    try {
      if (transactionalDdl) {
        await db.transaction(body, { immediate: true })
      } else {
        await body(db)
      }
    } catch (error) {
      throw new CogentaError({
        code: 'MIGRATION_FAILED',
        message: `Migration "${migration.id}" failed going ${direction}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        hint: transactionalDdl
          ? 'The transaction was rolled back, so the schema is unchanged. Fix the migration and run again.'
          : 'MySQL commits DDL implicitly, so this migration may be half applied. Inspect the schema before running again — the engine cannot roll it back for you.',
        cause: error,
        details: { id: migration.id, direction, rolledBack: transactionalDdl },
      })
    }

    const durationMs = now() - startedAt
    logger.info(`migration ${direction}`, { id: migration.id, name, durationMs })
    return { id: migration.id, name, direction, durationMs }
  }

  return {
    status: async (): Promise<MigrationStatus[]> => {
      await ensureTables()
      const applied = await appliedRecords()

      return ordered.map((migration) => {
        const record = applied.get(migration.id)
        return {
          id: migration.id,
          name: migration.name ?? migration.id,
          applied: record !== undefined,
          appliedAt: record?.appliedAt,
          durationMs: record?.durationMs,
          checksumMismatch:
            record !== undefined &&
            record.checksum !== null &&
            migration.checksum !== undefined &&
            record.checksum !== migration.checksum,
          destructive: migration.destructive === true,
          impact: migration.impact,
        }
      })
    },

    up: async (run: RunOptions = {}): Promise<MigrationOutcome[]> => {
      await ensureTables()
      await acquireLock()

      try {
        const applied = await appliedRecords()

        for (const migration of ordered) {
          const record = applied.get(migration.id)
          if (
            record !== undefined &&
            record.checksum !== null &&
            migration.checksum !== undefined &&
            record.checksum !== migration.checksum
          ) {
            throw new CogentaError({
              code: 'MIGRATION_CHECKSUM_MISMATCH',
              message: `Migration "${migration.id}" changed after it was applied here.`,
              hint: 'Never edit an applied migration: environments that ran the two versions now differ in ways nothing records. Write a new migration instead.',
              details: { id: migration.id },
            })
          }
        }

        let pending = ordered.filter((migration) => !applied.has(migration.id))
        if (run.to !== undefined) {
          const limit = pending.findIndex((migration) => migration.id === run.to)
          if (limit === -1 && !applied.has(run.to)) {
            throw new CogentaError({
              code: 'MIGRATION_FAILED',
              message: `No migration with id "${run.to}".`,
              hint: 'Check the id against `cogenta migrate status`.',
            })
          }
          pending = limit === -1 ? [] : pending.slice(0, limit + 1)
        }

        assertAllowed(pending, run)

        const outcomes: MigrationOutcome[] = []
        for (const migration of pending) outcomes.push(await runOne(migration, 'up'))
        return outcomes
      } finally {
        await releaseLock()
      }
    },

    down: async (run: RollbackOptions = {}): Promise<MigrationOutcome[]> => {
      await ensureTables()
      await acquireLock()

      try {
        const applied = await appliedRecords()
        const reversible = ordered.filter((migration) => applied.has(migration.id)).reverse()

        let target = reversible.slice(0, run.steps ?? 1)
        if (run.to !== undefined) {
          const limit = reversible.findIndex((migration) => migration.id === run.to)
          target = limit === -1 ? [] : reversible.slice(0, limit + 1)
        }

        assertAllowed(target, run)

        const outcomes: MigrationOutcome[] = []
        for (const migration of target) outcomes.push(await runOne(migration, 'down'))
        return outcomes
      } finally {
        await releaseLock()
      }
    },
  }
}
