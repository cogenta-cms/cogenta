import { afterAll, describe, expect, it } from 'vitest'
import { createLogger } from '../../src/logger/index.js'
import {
  createRateLimitRegistry,
  createRedisRateLimiter,
  loadRateLimitRedisModule,
  redisRateLimitDriver,
} from '../../src/rate-limit/index.js'
import { runRateLimitContract } from '../rate-limit/rate-limit.contract.js'

const url = process.env['COGENTA_TEST_REDIS_URL']

// A missing service is skipped loudly, never counted as a pass. A driver that
// silently goes untested is the most reliable way to ship a broken one.
if (url === undefined || url === '') {
  describe.skip('Redis rate limit driver', () => {
    it('skipped: COGENTA_TEST_REDIS_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  const module = await loadRateLimitRedisModule()
  if (module === null) throw new Error('@redis/client is not installed; run pnpm install')

  const client = module.createClient({ url })
  await client.connect()

  afterAll(async () => {
    await client.quit()
  })

  // Each contract run gets its own key namespace, so parallel runs and
  // leftovers from a previous run cannot make one test depend on another.
  let run = 0
  runRateLimitContract('redis (real server)', (clock) => {
    run += 1
    return { limiter: createRedisRateLimiter({ client, now: clock.now, prefix: `test:${run}:` }) }
  })

  describe('redis rate limit driver — real server', () => {
    const silent = createLogger({ level: 'silent' })

    it('is available when Redis answers, and is chosen as the optimal tier', async () => {
      const driver = redisRateLimitDriver()

      expect(await driver.available({ url })).toBe(true)
      expect(driver.tier).toBe('optimal')
    })

    it('is not available when nothing is listening, so the registry falls through', async () => {
      expect(await redisRateLimitDriver().available({ url: 'redis://127.0.0.1:1' })).toBe(false)
    })

    it('reports health without ever echoing the connection URL', async () => {
      const driver = redisRateLimitDriver()
      await driver.init({ url })

      const report = await driver.health()
      expect(report).toMatchObject({ status: 'ok', driver: 'redis', tier: 'optimal' })
      expect(JSON.stringify(report)).not.toContain('redis://')

      await driver.dispose()
    })

    it('is selected over the in-process counter when Redis is reachable', async () => {
      const selection = await createRateLimitRegistry({ logger: silent }).select({ url })

      expect(selection.driver).toBe('redis')
      expect(selection.tier).toBe('optimal')
      await selection.dispose()
    })

    it('really shares one count across two independent clients — the property the in-process driver cannot offer', async () => {
      const prefix = `test:shared:${Date.now()}:`
      const a = createRedisRateLimiter({ client, prefix })
      const secondModule = await loadRateLimitRedisModule()
      if (secondModule === null) throw new Error('unreachable: checked above')
      const secondClient = secondModule.createClient({ url })
      await secondClient.connect()
      const b = createRedisRateLimiter({ client: secondClient, prefix })

      await a.consume('shared-key', { limit: 3, windowMs: 60_000 })
      await a.consume('shared-key', { limit: 3, windowMs: 60_000 })
      const fromB = await b.consume('shared-key', { limit: 3, windowMs: 60_000 })

      expect(fromB.remaining).toBe(0)
      await secondClient.quit()
    })
  })
}
