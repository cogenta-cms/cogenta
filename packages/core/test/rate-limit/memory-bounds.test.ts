import { describe, expect, it } from 'vitest'
import { createMemoryRateLimiter } from '../../src/rate-limit/index.js'

const WINDOW = { limit: 3, windowMs: 60_000 }

/** How many buckets the limiter holds, read from the outside through behaviour only. */
async function isStillCounted(
  limiter: ReturnType<typeof createMemoryRateLimiter>,
  key: string,
): Promise<boolean> {
  // A key whose bucket survived has already spent one call; a dropped one starts again.
  const result = await limiter.consume(key, WINDOW)
  return result.remaining < WINDOW.limit - 1
}

describe('memory rate limiter — bounded memory', () => {
  it('forgets expired keys instead of keeping every key it has ever seen', async () => {
    let clock = 0
    const limiter = createMemoryRateLimiter({ now: () => clock, maxKeys: 64 })
    for (let index = 0; index < 64; index += 1) {
      await limiter.consume(`old-${index}`, WINDOW)
    }
    clock += 2 * WINDOW.windowMs
    // A fresh key at the ceiling must sweep the expired ones rather than evict live ones.
    await limiter.consume('fresh', WINDOW)
    for (let index = 0; index < 63; index += 1) {
      await limiter.consume(`new-${index}`, WINDOW)
    }
    expect(await isStillCounted(limiter, 'fresh')).toBe(true)
  })

  it('never holds more keys than its ceiling, however many distinct keys arrive', async () => {
    const limiter = createMemoryRateLimiter({ now: () => 0, maxKeys: 10 })
    await limiter.consume('first', WINDOW)
    for (let index = 0; index < 1_000; index += 1) {
      await limiter.consume(`flood-${index}`, WINDOW)
    }
    // The oldest window was dropped to make room: its key starts over.
    expect(await isStillCounted(limiter, 'first')).toBe(false)
    // The most recent ones are still counted.
    expect(await isStillCounted(limiter, 'flood-999')).toBe(true)
  })

  it('sweeps expired keys before dropping a live one when the ceiling is reached', async () => {
    let clock = 0
    const limiter = createMemoryRateLimiter({ now: () => clock, maxKeys: 100 })
    const results = []
    for (let round = 0; round < 3; round += 1) {
      results.push(await limiter.consume('steady', { limit: 3, windowMs: 10_000 }))
      for (let index = 0; index < 90; index += 1) {
        await limiter.consume(`noise-${round}-${index}`, { limit: 3, windowMs: 1 })
      }
      clock += 2
    }
    expect(results.map((result) => result.allowed)).toEqual([true, true, true])
    expect(results.at(-1)?.remaining).toBe(0)
    expect((await limiter.consume('steady', { limit: 3, windowMs: 10_000 })).allowed).toBe(false)
  })
})
