import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createScheduledTaskRegistry } from '../../src/scheduling/registry.js'

/**
 * L22 task 6 — the acceptance criterion in one line: *two `tick()` calls
 * racing the same due task, from two real connections to the same database,
 * must execute that task exactly once.*
 *
 * Two things make this a real test rather than a hopeful one, same discipline
 * as `packages/commerce/test/stock-concurrency.test.ts`'s stock test.
 *
 * A **file**, not `:memory:`. Two in-memory SQLite handles are two unrelated
 * databases — nothing in the world can actually race against itself there. A
 * file is one database two connections genuinely contend for.
 *
 * A **naive control**. `naiveTick` below re-implements the exact bug this
 * task fixes — read the last run, decide due, run, then record — against the
 * same file and the same two connections, and asserts that it *does* run the
 * task twice. Without that, a green result for the real registry would be
 * equally consistent with "the claim works" and with "the test never
 * actually raced anything".
 */

interface FileDb {
  readonly db: DatabaseHandle
  readonly path: string
  dispose(): Promise<void>
}

async function testFileDb(): Promise<FileDb> {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-scheduler-lock-'))
  const path = join(directory, 'scheduler.db')
  const db = await createSqliteHandle({ url: path })
  return {
    db,
    path,
    dispose: async () => {
      await db.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

describe('createScheduledTaskRegistry — concurrent tick()', () => {
  let fixture: FileDb | undefined
  let second: DatabaseHandle | undefined

  afterEach(async () => {
    if (second !== undefined) await second.close()
    if (fixture !== undefined) await fixture.dispose()
    second = undefined
    fixture = undefined
  })

  it('runs a due task exactly once when two replicas tick() at the same instant', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    let executions = 0
    const clock = 1_700_000_000_000

    const replicaA = createScheduledTaskRegistry({ db: fixture.db, now: () => clock })
    const replicaB = createScheduledTaskRegistry({ db: second, now: () => clock })

    for (const replica of [replicaA, replicaB]) {
      replica.register({
        name: 'trash-purge',
        description: 'Purge the trash past its retention window.',
        intervalMs: 60_000,
        destructive: true,
        run: async () => {
          executions += 1
          return { summary: 'ran' }
        },
      })
    }

    const [resultA, resultB] = await Promise.all([replicaA.tick(clock), replicaB.tick(clock)])

    // Exactly one replica's tick() claimed and ran the task — the other saw
    // the claim already taken and skipped it, not an error, just nothing.
    const ranBy = [resultA.ran, resultB.ran].filter((ran) => ran.includes('trash-purge'))
    expect(ranBy).toHaveLength(1)
    expect(executions).toBe(1)
  })

  it('holds under ten replicas racing the same never-run task', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    let executions = 0
    const clock = 1_700_000_000_000

    // Alternating between two real connections, so half the ticks come from
    // a client that has never seen the other's writes — same shape as the
    // commerce stock test's twenty-buyer case.
    const replicas = Array.from({ length: 10 }, (_unused, index) =>
      createScheduledTaskRegistry({
        db: index % 2 === 0 ? (fixture as FileDb).db : (second as DatabaseHandle),
        now: () => clock,
      }),
    )
    for (const replica of replicas) {
      replica.register({
        name: 'audit-integrity',
        description: 'Verify the audit log hash chain.',
        intervalMs: 60_000,
        run: async () => {
          executions += 1
        },
      })
    }

    const results = await Promise.all(replicas.map((replica) => replica.tick(clock)))
    const ranCount = results.filter((result) => result.ran.includes('audit-integrity')).length

    expect(ranCount).toBe(1)
    expect(executions).toBe(1)
  })

  it("claims independently per task name — an unrelated task is never blocked by another's claim", async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const clock = 1_700_000_000_000
    const replicaA = createScheduledTaskRegistry({ db: fixture.db, now: () => clock })
    const replicaB = createScheduledTaskRegistry({ db: second, now: () => clock })

    let purgeRuns = 0
    let publishRuns = 0
    for (const replica of [replicaA, replicaB]) {
      replica.register({
        name: 'purge',
        description: 'x',
        intervalMs: 60_000,
        run: async () => {
          purgeRuns += 1
        },
      })
      replica.register({
        name: 'publish',
        description: 'x',
        intervalMs: 60_000,
        run: async () => {
          publishRuns += 1
        },
      })
    }

    await Promise.all([replicaA.tick(clock), replicaB.tick(clock)])

    // Each task claimed and ran exactly once — a claim on `purge` never
    // affects whether `publish` can be claimed by the same or the other tick.
    expect(purgeRuns).toBe(1)
    expect(publishRuns).toBe(1)
  })

  it('the naive read-then-write tick() it replaces really does run a task twice', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const state = identifier('naive_task_state', 'sqlite')
    await fixture.db.query(sql`
      create table ${state} (task_name varchar(64) not null primary key, last_run bigint)`)
    await fixture.db.query(
      sql`insert into ${state} (task_name, last_run) values (${'purge'}, null)`,
    )

    let executions = 0

    /**
     * The exact shape of the bug: read the last run, decide due in
     * JavaScript, do the work, then write. Nothing between the read and the
     * write stops a second caller from reading the same "not due yet" state
     * and deciding the same thing.
     */
    const naiveTick = async (handle: DatabaseHandle, at: number): Promise<boolean> => {
      const read = await handle.query<{ last_run: unknown }>(
        sql`select last_run from ${state} where task_name = ${'purge'}`,
      )
      const lastRun = read.rows[0]?.last_run
      const due = lastRun === null || lastRun === undefined || at - Number(lastRun) >= 60_000
      if (!due) return false

      // The gap both callers fall into: each has already decided "due",
      // before either has recorded anything.
      await new Promise((resolve) => setTimeout(resolve, 5))

      executions += 1
      await handle.query(sql`update ${state} set last_run = ${at} where task_name = ${'purge'}`)
      return true
    }

    const clock = 1_700_000_000_000
    const results = await Promise.all([naiveTick(fixture.db, clock), naiveTick(second, clock)])

    // Both "ran" — the same task, twice, at the same instant. This is the bug
    // the compare-and-set claim in the real registry exists to prevent,
    // demonstrated rather than described.
    expect(results).toEqual([true, true])
    expect(executions).toBe(2)
  })
})
