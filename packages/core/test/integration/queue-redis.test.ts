import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/logger/index.js'
import { bullmqQueueDriver, createBullmqQueue, loadBullmqModule } from '../../src/queue/index.js'
import { realTimeClock, runQueueContract } from '../queue/queue.contract.js'

const url = process.env['COGENTA_TEST_REDIS_URL']

// A missing service is skipped loudly, never counted as a pass. A driver that
// silently goes untested is the most reliable way to ship a broken one.
if (url === undefined || url === '') {
  describe.skip('Redis queue (bullmq)', () => {
    it('skipped: COGENTA_TEST_REDIS_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  const module = await loadBullmqModule()
  if (module === null) throw new Error('bullmq is not installed; run pnpm install')

  const redisUrl = url
  const silent = createLogger({ level: 'silent' })

  // Every wait below is a real one: bullmq schedules against Redis's clock, not
  // ours. They are the smallest values that still leave room for a round trip.
  const LEASE_MS = 1500
  const STALLED_INTERVAL_MS = 400
  const BACKOFF_MS = 250

  // Each contract run gets its own key namespace, so a leftover from a previous
  // run cannot make one test depend on another.
  let run = 0

  runQueueContract('bullmq', async () => {
    run += 1
    const prefix = `cogenta:test:queue:${run}:${randomUUID().slice(0, 8)}`

    return {
      clock: realTimeClock,
      timing: {
        scheduleMs: 600,
        // Backoff is exponential from BACKOFF_MS; this outlasts the third retry.
        retryDelayMs: 1600,
        // Lock expiry, plus the two stalled-checker passes bullmq needs before
        // it hands an abandoned job back.
        leaseRecoveryMs: LEASE_MS + STALLED_INTERVAL_MS * 4 + 800,
      },

      createDriver: (options) =>
        Promise.resolve(
          createBullmqQueue({
            module,
            url: redisUrl,
            prefix,
            logger: silent,
            leaseMs: LEASE_MS,
            stalledIntervalMs: STALLED_INTERVAL_MS,
            backoffMs: BACKOFF_MS,
            ...options,
          }),
        ),

      abandon: async (job) => {
        // A worker that claimed the job and was killed: the lock stays in Redis
        // with nobody to renew or release it. Force-closing is the closest a
        // test can get to `kill -9` without leaving the process.
        const doomed = new module.Worker(job.name, null, {
          connection: { url: redisUrl },
          prefix,
          autorun: false,
          lockDuration: LEASE_MS,
          stalledInterval: STALLED_INTERVAL_MS,
          skipLockRenewal: true,
        })

        const claimed = await doomed.getNextJob(randomUUID(), { block: false })
        if (claimed === undefined || claimed === null) {
          throw new Error('nothing to abandon: the job was not claimable')
        }
        await doomed.close(true)
      },

      dispose: async () => {
        // The namespace is unique per run, so wiping it by pattern cannot touch
        // anything this test did not create.
        const control = new module.Queue('__cogenta_control', {
          connection: { url: redisUrl },
          prefix,
        })
        const client = (await control.getBackend().client) as unknown as {
          keys(pattern: string): Promise<string[]>
          del(...keys: string[]): Promise<number>
        }
        const keys = await client.keys(`${prefix}*`)
        if (keys.length > 0) await client.del(...keys)
        await control.close()
      },
    }
  })

  describe('bullmq queue driver', () => {
    it('is available when Redis answers, and is chosen as the optimal tier', async () => {
      const driver = bullmqQueueDriver()

      expect(await driver.available({ url: redisUrl })).toBe(true)
      expect(driver.tier).toBe('optimal')
    })

    it('is not available when nothing is listening, so the caller falls through', async () => {
      expect(await bullmqQueueDriver().available({ url: 'redis://127.0.0.1:1' })).toBe(false)
    })

    it('is not available when no URL is configured at all', async () => {
      expect(await bullmqQueueDriver().available({})).toBe(false)
    })

    it('reports health without ever echoing the connection URL', async () => {
      const driver = bullmqQueueDriver({
        prefix: `cogenta:test:health:${randomUUID().slice(0, 8)}`,
      })
      await driver.init({ url: redisUrl })

      const report = await driver.health()
      expect(report).toMatchObject({ status: 'ok', driver: 'bullmq', tier: 'optimal' })
      expect(JSON.stringify(report)).not.toContain('redis://')

      await driver.dispose()
    })

    it('reports itself down before anything connected it', async () => {
      expect(await bullmqQueueDriver().health()).toMatchObject({
        status: 'down',
        driver: 'bullmq',
        tier: 'optimal',
      })
    })

    it('refuses to initialise without a URL, and says what to do about it', async () => {
      await expect(bullmqQueueDriver().init({})).rejects.toMatchObject({
        code: 'DRIVER_INIT_FAILED',
      })
    })

    it('leaves jobs it does not own alone, because the namespace is its own', async () => {
      const mine = `cogenta:test:isolation:${randomUUID().slice(0, 8)}`
      const theirs = `cogenta:test:isolation:${randomUUID().slice(0, 8)}`

      const a = createBullmqQueue({ module, url: redisUrl, prefix: mine, logger: silent })
      const b = createBullmqQueue({ module, url: redisUrl, prefix: theirs, logger: silent })

      const untouched = await b.enqueue({ name: 'shared-name' })
      await a.enqueue({ name: 'shared-name' })

      let drained = 0
      a.process('shared-name', async () => {
        drained += 1
      })

      expect(await a.tick()).toBe(1)
      expect(drained).toBe(1)
      expect((await b.status(untouched))?.status).toBe('pending')

      await a.close()
      await b.close()
    })
  })
}
