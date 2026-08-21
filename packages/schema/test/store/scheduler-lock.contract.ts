import { randomUUID } from 'node:crypto'
import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createScheduledTaskRegistry } from '../../src/scheduling/registry.js'

/**
 * The single contract suite for the scheduler's compare-and-set claim (L22
 * task 6), played against every dialect — SQLite as a real unit test (see
 * `test/scheduling/registry-lock.test.ts`, which also carries the naive
 * unlocked counter-test) and Postgres/MySQL/MariaDB here as integration
 * tests when the services are up.
 *
 * One suite because the guarantee — two replicas racing `tick()` for the
 * same task run it exactly once — is dialect-independent by construction:
 * the claim is a single `UPDATE ... WHERE` and nothing dialect-specific
 * backs it.
 */

export interface LockHarness {
  /** Two independent connections to the *same* server database. */
  readonly a: DatabaseHandle
  readonly b: DatabaseHandle
  dispose(): Promise<void>
}

export function runSchedulerLockContract(label: string, create: () => Promise<LockHarness>): void {
  describe(`scheduled-task claim — ${label}`, () => {
    let harness: LockHarness | undefined

    afterEach(async () => {
      if (harness !== undefined) await harness.dispose()
      harness = undefined
    })

    it('runs a due task exactly once when two replicas tick() at the same instant', async () => {
      harness = await create()
      const clock = 1_700_000_000_000
      let executions = 0

      // A fresh, random task name per run: this suite runs against a real,
      // persistent server database, so a fixed name would pick up a claim
      // row left behind by an earlier run and make the task look not-due
      // instead of proving anything about the race.
      const taskName = `trash-purge-${randomUUID()}`

      const replicaA = createScheduledTaskRegistry({ db: harness.a, now: () => clock })
      const replicaB = createScheduledTaskRegistry({ db: harness.b, now: () => clock })

      for (const replica of [replicaA, replicaB]) {
        replica.register({
          name: taskName,
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

      const ranBy = [resultA.ran, resultB.ran].filter((ran) => ran.includes(taskName))
      expect(ranBy).toHaveLength(1)
      expect(executions).toBe(1)
    })
  })
}
