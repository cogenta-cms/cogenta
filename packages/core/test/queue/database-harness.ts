import { type DatabaseHandle, identifier, sql } from '../../src/db/index.js'
import { createLogger } from '../../src/logger/index.js'
import { createDatabaseQueue } from '../../src/queue/index.js'
import { createFakeClock, type QueueContractHarness } from './queue.contract.js'

const silent = createLogger({ level: 'silent' })
const LEASE_MS = 60_000

export interface DatabaseQueueBacking {
  /** Another connection to the **same** database, for the concurrency tests. */
  open(): Promise<DatabaseHandle>
  dispose?(): Promise<void>
}

/**
 * Binds the shared `QueueDriver` contract to the database driver.
 *
 * It lives outside the contract file so the SQLite unit run and the
 * Postgres/MySQL/MariaDB integration runs share one definition of "how the
 * database queue is staged" instead of three copies.
 */
export function databaseQueueHarness(
  create: () => Promise<DatabaseQueueBacking>,
): () => Promise<QueueContractHarness> {
  return async () => {
    const clock = createFakeClock()
    const backing = await create()
    const handles: DatabaseHandle[] = []

    const primary = await backing.open()
    handles.push(primary)
    let created = 0
    const table = identifier('cogenta_jobs', primary.dialect)
    await primary.query(sql`drop table if exists ${table}`)

    return {
      clock,
      // The clock is ours, so waiting costs nothing and the numbers can be
      // the ones a real deployment would use.
      timing: {
        scheduleMs: 60_000,
        retryDelayMs: 300_000,
        leaseRecoveryMs: LEASE_MS + 1_000,
      },

      createDriver: async (options) => {
        // Every driver past the first gets its own connection: the concurrency
        // test only proves anything when the claims race on the wire.
        created += 1
        const handle = created === 1 ? primary : await backing.open()
        if (handle !== primary) handles.push(handle)

        return createDatabaseQueue({
          db: handle,
          logger: silent,
          now: clock.now,
          leaseMs: LEASE_MS,
          ...options,
        })
      },

      abandon: async (job) => {
        // What a killed worker leaves in the table: claimed, leased, and nobody
        // left to write an outcome.
        await primary.query(sql`
          update ${table}
          set status = ${'running'},
              locked_by = ${'dead'},
              locked_until = ${clock.now() + LEASE_MS}
          where id = ${job.id}`)
      },

      dispose: async () => {
        await primary.query(sql`drop table if exists ${table}`)
        // Close before dispose: Windows refuses to delete a file that is still
        // open, so removing the directory first fails with EBUSY.
        for (const handle of handles.splice(0)) await handle.close()
        await backing.dispose?.()
      },
    }
  }
}
