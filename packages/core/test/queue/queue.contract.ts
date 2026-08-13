import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DatabaseHandle, identifier, sql } from '../../src/db/index.js'
import { createLogger } from '../../src/logger/index.js'
import { createDatabaseQueue, type QueueDriver } from '../../src/queue/index.js'
import type { TestClock } from '../cache/cache.contract.js'
import { createTestClock } from '../cache/cache.contract.js'

const silent = createLogger({ level: 'silent' })

export interface QueueContractHarness {
  readonly db: DatabaseHandle
  /** Another connection to the **same** database, for the concurrency tests. */
  connect(): Promise<DatabaseHandle>
  dispose?(): Promise<void>
}

/**
 * The single contract suite for `QueueDriver`.
 *
 * The test that matters most is the last one. L0's acceptance criterion says two
 * concurrent workers must never process the same job, and it is not provable
 * with a mock: it needs real connections racing on a real database.
 */
export function runQueueContract(name: string, create: () => Promise<QueueContractHarness>): void {
  describe(`QueueDriver contract — ${name}`, () => {
    let harness: QueueContractHarness
    let db: DatabaseHandle
    let clock: TestClock
    let queue: QueueDriver
    const opened: DatabaseHandle[] = []

    const makeQueue = (handle: DatabaseHandle = db): QueueDriver =>
      createDatabaseQueue({ db: handle, logger: silent, now: clock.now })

    beforeEach(async () => {
      clock = createTestClock()
      harness = await create()
      db = harness.db
      await db.query(sql`drop table if exists ${identifier('cogenta_jobs', db.dialect)}`)
      queue = makeQueue()
    })

    afterEach(async () => {
      await queue.close()
      for (const handle of opened.splice(0)) await handle.close()
      await db.query(sql`drop table if exists ${identifier('cogenta_jobs', db.dialect)}`)
      // Close before dispose: Windows refuses to delete a file that is still
      // open, so removing the directory first fails with EBUSY.
      await db.close()
      await harness.dispose?.()
    })

    describe('running jobs', () => {
      it('runs a handler for the job that was enqueued', async () => {
        const seen: string[] = []
        queue.process('greet', async (job) => {
          seen.push((job.payload as { who: string }).who)
        })

        await queue.enqueue({ name: 'greet', payload: { who: 'world' } })

        expect(await queue.tick()).toBe(1)
        expect(seen).toEqual(['world'])
      })

      it('does not run the same job twice', async () => {
        let runs = 0
        queue.process('once', async () => {
          runs += 1
        })
        await queue.enqueue({ name: 'once' })

        await queue.tick()
        await queue.tick()

        expect(runs).toBe(1)
      })

      it('round-trips every payload shape a caller might enqueue', async () => {
        const payloads: unknown[] = []
        queue.process('any', async (job) => {
          payloads.push(job.payload)
        })

        await queue.enqueue({ name: 'any', payload: { nested: { list: [1, 'two', null] } } })
        await queue.enqueue({ name: 'any', payload: 'a string' })
        await queue.enqueue({ name: 'any', payload: 42 })
        await queue.enqueue({ name: 'any' })
        await queue.tick()

        // Compared without order: a queue promises priority, not insertion order
        // among jobs enqueued at the same instant with the same priority.
        expect(payloads).toHaveLength(4)
        expect(payloads).toContainEqual({ nested: { list: [1, 'two', null] } })
        expect(payloads).toContainEqual('a string')
        expect(payloads).toContainEqual(42)
        expect(payloads).toContainEqual(null)
      })

      it('leaves a job alone when nothing here handles its name', async () => {
        // Two workers with different handlers each take their own work, rather
        // than claiming jobs they would have to put back.
        await queue.enqueue({ name: 'handled-elsewhere' })

        expect(await queue.tick()).toBe(0)
        expect((await queue.status(await queue.enqueue({ name: 'x' })))?.status).toBe('pending')
      })

      it('does nothing, and says so, when the queue is empty', async () => {
        queue.process('none', async () => undefined)

        expect(await queue.tick()).toBe(0)
      })

      it('refuses two handlers for the same name', () => {
        queue.process('dup', async () => undefined)

        expect(() => queue.process('dup', async () => undefined)).toThrowError(/dup/)
      })
    })

    describe('scheduling', () => {
      it('does not run a job before its time', async () => {
        queue.process('later', async () => undefined)
        await queue.enqueue({ name: 'later', runAt: clock.now() + 60_000 })

        expect(await queue.tick()).toBe(0)
      })

      it('runs it once its time has come', async () => {
        queue.process('later', async () => undefined)
        await queue.enqueue({ name: 'later', runAt: clock.now() + 60_000 })

        clock.advance(61)

        expect(await queue.tick()).toBe(1)
      })

      it('runs higher priority first', async () => {
        const order: string[] = []
        queue.process('p', async (job) => {
          order.push((job.payload as { tag: string }).tag)
        })

        await queue.enqueue({ name: 'p', payload: { tag: 'low' }, priority: 0 })
        await queue.enqueue({ name: 'p', payload: { tag: 'high' }, priority: 10 })
        await queue.tick()

        expect(order[0]).toBe('high')
      })
    })

    describe('failure and retry', () => {
      it('retries a failed job instead of dropping it', async () => {
        let attempts = 0
        queue.process('flaky', async () => {
          attempts += 1
          if (attempts < 2) throw new Error('not yet')
        })
        const id = await queue.enqueue({ name: 'flaky', maxAttempts: 3 })

        await queue.tick()
        expect((await queue.status(id))?.status).toBe('pending')

        clock.advance(120)
        await queue.tick()

        expect(attempts).toBe(2)
        expect((await queue.status(id))?.status).toBe('completed')
      })

      it('waits before retrying, rather than spinning', async () => {
        queue.process('always-fails', async () => {
          throw new Error('nope')
        })
        await queue.enqueue({ name: 'always-fails', maxAttempts: 5 })

        await queue.tick()
        // Immediately after a failure the job is not due again.
        expect(await queue.tick()).toBe(0)
      })

      it('gives up after maxAttempts and records why', async () => {
        queue.process('doomed', async () => {
          throw new Error('the door is locked')
        })
        const id = await queue.enqueue({ name: 'doomed', maxAttempts: 2 })

        for (let i = 0; i < 4; i += 1) {
          await queue.tick()
          clock.advance(300)
        }

        const state = await queue.status(id)
        expect(state?.status).toBe('failed')
        expect(state?.attempt).toBe(2)
        expect(state?.lastError).toContain('the door is locked')
      })

      it('counts attempts as they happen', async () => {
        queue.process('counted', async () => {
          throw new Error('x')
        })
        const id = await queue.enqueue({ name: 'counted', maxAttempts: 3 })

        await queue.tick()

        expect((await queue.status(id))?.attempt).toBe(1)
      })
    })

    describe('cancelling and inspecting', () => {
      it('cancels a job that has not started', async () => {
        queue.process('c', async () => undefined)
        const id = await queue.enqueue({ name: 'c' })

        await queue.cancel(id)

        expect((await queue.status(id))?.status).toBe('cancelled')
        expect(await queue.tick()).toBe(0)
      })

      it('is silent about cancelling a job that does not exist', async () => {
        await expect(queue.cancel('no-such-job')).resolves.toBeUndefined()
      })

      it('returns null for a job that does not exist', async () => {
        expect(await queue.status('no-such-job')).toBeNull()
      })

      it('reports a completed job as completed', async () => {
        queue.process('done', async () => undefined)
        const id = await queue.enqueue({ name: 'done' })
        await queue.tick()

        expect((await queue.status(id))?.status).toBe('completed')
      })
    })

    describe('a worker that dies', () => {
      it('lets another worker take over the job once the lease expires', async () => {
        // The first worker claims the job and is killed before finishing, so it
        // never reports success or failure. Without lease expiry that job is
        // stuck as running forever.
        const abandoned = createDatabaseQueue({
          db,
          logger: silent,
          now: clock.now,
          leaseMs: 60_000,
        })
        abandoned.process('stuck', async () => {
          throw Object.assign(new Error('killed'), { silent: true })
        })

        const id = await queue.enqueue({ name: 'stuck', maxAttempts: 5 })

        // Claim it, then simulate the process disappearing mid-job by never
        // writing an outcome: mark it running by hand.
        await db.query(sql`
          update ${identifier('cogenta_jobs', db.dialect)}
          set status = ${'running'}, locked_by = ${'dead'}, locked_until = ${clock.now() + 60_000}
          where id = ${id}`)

        let recovered = 0
        const survivor = makeQueue()
        survivor.process('stuck', async () => {
          recovered += 1
        })

        expect(await survivor.tick()).toBe(0) // lease still held

        clock.advance(61)
        expect(await survivor.tick()).toBe(1)
        expect(recovered).toBe(1)
        await abandoned.close()
        await survivor.close()
      })
    })

    describe('concurrency — the L0 acceptance criterion', () => {
      it('never lets two workers process the same job', async () => {
        // Real connections, real database, no mock. This is the one property the
        // degraded queue driver cannot be shipped without.
        const workerCount = 4
        const jobCount = 24
        const handled: string[] = []

        const workers: QueueDriver[] = []
        for (let i = 0; i < workerCount; i += 1) {
          const handle = await harness.connect()
          opened.push(handle)

          const worker = createDatabaseQueue({
            db: handle,
            logger: silent,
            now: clock.now,
            batchSize: 5,
          })
          worker.process('shared', async (job) => {
            handled.push(job.id)
          })
          workers.push(worker)
        }

        for (let i = 0; i < jobCount; i += 1) {
          await queue.enqueue({ name: 'shared', payload: { i } })
        }

        // Drain concurrently until nothing is left.
        for (let round = 0; round < 10; round += 1) {
          const counts = await Promise.all(workers.map((worker) => worker.tick()))
          if (counts.every((count) => count === 0)) break
        }

        expect(handled).toHaveLength(jobCount)
        expect(new Set(handled).size).toBe(jobCount)

        for (const worker of workers) await worker.close()
      })
    })
  })
}
