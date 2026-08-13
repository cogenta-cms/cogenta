import { afterAll, describe, expect, it } from 'vitest'
import { createRedisCache, loadRedisModule, redisCacheDriver } from '../../src/cache/index.js'
import { createLogger } from '../../src/logger/index.js'
import { runCacheContract } from '../cache/cache.contract.js'

const url = process.env['COGENTA_TEST_REDIS_URL']

// A missing service is skipped loudly, never counted as a pass. A driver that
// silently goes untested is the most reliable way to ship a broken one.
if (url === undefined || url === '') {
  describe.skip('Redis cache', () => {
    it('skipped: COGENTA_TEST_REDIS_URL is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  const module = await loadRedisModule()
  if (module === null) throw new Error('@redis/client is not installed; run pnpm install')

  const client = module.createClient({ url })
  await client.connect()

  afterAll(async () => {
    await client.quit()
  })

  // Each contract run gets its own key namespace, so parallel runs and leftovers
  // from a previous run cannot make one test depend on another.
  let run = 0
  runCacheContract('redis', (clock) => {
    run += 1
    return { cache: createRedisCache({ client, now: clock.now, prefix: `test:${run}:` }) }
  })

  describe('redis cache driver', () => {
    const silent = createLogger({ level: 'silent' })

    it('is available when Redis answers, and is chosen as the optimal tier', async () => {
      const driver = redisCacheDriver()

      expect(await driver.available({ url })).toBe(true)
      expect(driver.tier).toBe('optimal')
    })

    it('is not available when nothing is listening, so the registry falls through', async () => {
      expect(await redisCacheDriver().available({ url: 'redis://127.0.0.1:1' })).toBe(false)
    })

    it('is not available when no URL is configured at all', async () => {
      expect(await redisCacheDriver().available({})).toBe(false)
    })

    it('reports health without ever echoing the connection URL', async () => {
      const driver = redisCacheDriver()
      await driver.init({ url })

      const report = await driver.health()
      expect(report).toMatchObject({ status: 'ok', driver: 'redis', tier: 'optimal' })
      expect(JSON.stringify(report)).not.toContain('redis://')

      await driver.dispose()
    })

    it('leaves keys it does not own alone when clearing', async () => {
      await client.set('someone-elses-key', 'keep me')
      const cache = createRedisCache({ client, prefix: 'test:isolation:' })

      await cache.set('mine', 'x')
      await cache.clear()

      expect(await client.get('someone-elses-key')).toBe('keep me')
      expect(await cache.get('mine')).toBeNull()

      await client.del(['someone-elses-key'])
    })

    it('lets Redis expire the entry on its own clock as well', async () => {
      const cache = createRedisCache({ client, prefix: 'test:ttl:' })
      await cache.set('k', 'v', { ttl: 1 })

      expect(await client.get('test:ttl:e:k')).not.toBeNull()

      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(await client.get('test:ttl:e:k')).toBeNull()
    })

    it('is selected over the file driver when Redis is reachable', async () => {
      const { createCacheRegistry } = await import('../../src/cache/index.js')
      const selection = await createCacheRegistry({ logger: silent }).select({ url })

      expect(selection.driver).toBe('redis')
      expect(selection.tier).toBe('optimal')
      await selection.dispose()
    })
  })
}
