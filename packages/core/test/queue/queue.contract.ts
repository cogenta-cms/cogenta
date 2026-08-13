import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JobId, QueueDriver } from '../../src/queue/index.js'

/**
 * Time, as the driver under test experiences it.
 *
 * The database queue takes its clock from us, so the suite can jump. bullmq
 * schedules inside Redis against wall-clock time it owns, so the same suite has
 * to actually wait. Making that the harness's business is what keeps a single
 * contract file instead of two that drift apart.
 */
export interface QueueContractClock {
  now(): number
  advance(ms: number): Promise<void>
}

export function createFakeClock(start = 1_700_000_000_000): QueueContractClock {
  let current = start
  return {
    now: () => current,
    advance: (ms) => {
      current += ms
      return Promise.resolve()
    },
  }
}

/** For a driver whose scheduling lives in a server's clock rather than ours. */
export const realTimeClock: QueueContractClock = {
  now: () => Date.now(),
  advance: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * Durations the suite reasons with. A driver that really sleeps needs small
 * ones; a driver with a clock we own can afford minutes for free.
 */
export interface QueueContractTiming {
  /** How far ahead a job that must not run yet is scheduled. */
  readonly scheduleMs: number
  /** A wait that outlasts the driver's retry backoff. */
  readonly retryDelayMs: number
  /** A wait that outlasts an abandoned job's lease, recovery included. */
  readonly leaseRecoveryMs: number
}

export interface QueueContractDriverOptions {
  readonly batchSize?: number
}

export interface QueueContractHarness {
  readonly clock: QueueContractClock
  readonly timing: QueueContractTiming
  /**
   * A driver instance on the same backing store. Called more than once: the
   * concurrency test needs real workers racing, not one object shared around.
   */
  createDriver(options?: QueueContractDriverOptions): Promise<QueueDriver>
  /**
   * Leaves the job in the state a worker that claimed it and was killed leaves
   * behind: held, with nobody left to report an outcome. Each driver holds jobs
   * its own way, so only the harness can stage it.
   */
  abandon(job: { readonly id: JobId; readonly name: string }): Promise<void>
  dispose?(): Promise<void>
}

/**
 * The single contract suite for `QueueDriver`. Every implementation runs **this**
 * file — never a copy adapted to what that driver happens to do.
 *
 * The test that matters most is the last one. L0's acceptance criterion says two
 * concurrent workers must never process the same job, and it is not provable
 * with a mock: it needs real workers racing on a real backing store.
 */
export function runQueueContract(name: string, create: () => Promise<QueueContractHarness>): void {
  describe(`QueueDriver contract — ${name}`, () => {
    let harness: QueueContractHarness
    let clock: QueueContractClock
    let timing: QueueContractTiming
    let queue: QueueDriver
    const opened: QueueDriver[] = []

    const newDriver = async (options?: QueueContractDriverOptions): Promise<QueueDriver> => {
      const driver = await harness.createDriver(options)
      opened.push(driver)
      return driver
    }

    beforeEach(async () => {
      harness = await create()
      clock = harness.clock
      timing = harness.timing
      queue = await newDriver()
    })

    afterEach(async () => {
      for (const driver of opened.splice(0)) await driver.close()
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
        await queue.enqueue({ name: 'later', runAt: clock.now() + timing.scheduleMs })

        expect(await queue.tick()).toBe(0)
      })

      it('runs it once its time has come', async () => {
        queue.process('later', async () => undefined)
        await queue.enqueue({ name: 'later', runAt: clock.now() + timing.scheduleMs })

        await clock.advance(timing.scheduleMs * 2)

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

        await clock.advance(timing.retryDelayMs)
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
          await clock.advance(timing.retryDelayMs)
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
        const id = await queue.enqueue({ name: 'stuck', maxAttempts: 5 })
        await harness.abandon({ id, name: 'stuck' })

        let recovered = 0
        const survivor = await newDriver()
        survivor.process('stuck', async () => {
          recovered += 1
        })

        expect(await survivor.tick()).toBe(0) // lease still held

        await clock.advance(timing.leaseRecoveryMs)

        expect(await survivor.tick()).toBe(1)
        expect(recovered).toBe(1)
      })
    })

    describe('concurrency — the L0 acceptance criterion', () => {
      it('never lets two workers process the same job', async () => {
        // Real workers, real backing store, no mock. This is the one property no
        // queue driver can be shipped without.
        const workerCount = 4
        const jobCount = 24
        const handled: string[] = []

        const workers: QueueDriver[] = []
        for (let i = 0; i < workerCount; i += 1) {
          const worker = await newDriver({ batchSize: 5 })
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
      })
    })
  })
}
