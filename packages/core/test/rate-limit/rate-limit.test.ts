import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/logger/index.js'
import {
  createMemoryRateLimiter,
  createRateLimitRegistry,
  createRedisRateLimiter,
} from '../../src/rate-limit/index.js'
import { createFakeRedis } from './fake-redis.js'
import { runRateLimitContract } from './rate-limit.contract.js'

// One contract, every implementation — the degraded driver (memory) is run
// through exactly the same suite as the optimal one (Redis), never a lighter
// copy: AGENTS.md is explicit that the degraded driver must be tested, not
// only the optimal one.
runRateLimitContract('memory', (clock) => ({
  limiter: createMemoryRateLimiter({ now: clock.now }),
}))

// Against an in-memory double: this proves the driver's own logic (window
// naming, atomic increment, expiry) satisfies the contract on every machine,
// with no service running. Compatibility with a real server would be proven
// separately by an integration test against real Redis (skipped when
// `services:up` was not run, per the `integration-tests` skill) — there is
// none checked in here because this repository's Docker engine refuses every
// API call this session, the same environment limitation already logged in
// `BLOCKERS.md` for the cache and queue drivers' own Redis integration tests.
runRateLimitContract('redis (in-memory double)', (clock) => ({
  limiter: createRedisRateLimiter({
    client: createFakeRedis(),
    now: clock.now,
    prefix: `test:${Math.random().toString(36).slice(2)}:`,
  }),
}))

const silent = createLogger({ level: 'silent' })

describe('rate limit registry', () => {
  it('falls back to memory when no Redis URL is configured', async () => {
    const selection = await createRateLimitRegistry({ logger: silent }).select({})

    expect(selection.driver).toBe('memory')
    expect(selection.tier).toBe('degraded')
    await selection.dispose()
  })

  it('honours an explicitly named driver', async () => {
    const selection = await createRateLimitRegistry({ logger: silent }).select({
      driver: 'memory',
    })

    expect(selection.driver).toBe('memory')
    expect(selection.requested).toBe(true)
    await selection.dispose()
  })

  it('reports health that says what is running and what it costs', async () => {
    const selection = await createRateLimitRegistry({ logger: silent }).select({
      driver: 'memory',
    })

    expect(await selection.health()).toMatchObject({
      driver: 'memory',
      tier: 'degraded',
      message: expect.stringContaining('independently'),
    })
    await selection.dispose()
  })
})

describe('redis rate limit driver — namespacing', () => {
  it('keeps two prefixes from seeing each other', async () => {
    const client = createFakeRedis()
    const a = createRedisRateLimiter({ client, prefix: 'site-a:' })
    const b = createRedisRateLimiter({ client, prefix: 'site-b:' })

    for (let i = 0; i < 3; i += 1) await a.consume('key', { limit: 3, windowMs: 60_000 })
    const bFirst = await b.consume('key', { limit: 3, windowMs: 60_000 })

    expect(bFirst.allowed).toBe(true)
    expect(bFirst.remaining).toBe(2)
  })
})
