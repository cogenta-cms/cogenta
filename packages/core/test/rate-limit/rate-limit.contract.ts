import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RateLimitDriver } from '../../src/rate-limit/index.js'

/** A clock the suite can move, so window tests never sleep. */
export interface TestClock {
  now(): number
  advance(ms: number): void
}

export function createTestClock(start = 1_700_000_000_000): TestClock {
  let current = start
  return {
    now: () => current,
    advance: (ms) => {
      current += ms
    },
  }
}

export interface RateLimitContractHarness {
  readonly limiter: RateLimitDriver
  dispose?(): Promise<void>
}

/**
 * The single contract suite for `RateLimitDriver`. Every implementation runs
 * **this** file — never a copy adapted to what that driver happens to do. A
 * behaviour only one driver honours is a leaky abstraction, and this is
 * where it surfaces (skill `new-driver`).
 */
export function runRateLimitContract(
  name: string,
  create: (clock: TestClock) => Promise<RateLimitContractHarness> | RateLimitContractHarness,
): void {
  describe(`RateLimitDriver contract — ${name}`, () => {
    let clock: TestClock
    let harness: RateLimitContractHarness
    let limiter: RateLimitDriver

    beforeEach(async () => {
      clock = createTestClock()
      harness = await create(clock)
      limiter = harness.limiter
    })

    afterEach(async () => {
      await harness.dispose?.()
    })

    it('allows requests under the limit', async () => {
      const result = await limiter.consume('key-a', { limit: 5, windowMs: 60_000 })
      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(5)
      expect(result.remaining).toBe(4)
    })

    it('counts every call against the same key', async () => {
      await limiter.consume('key-a', { limit: 5, windowMs: 60_000 })
      await limiter.consume('key-a', { limit: 5, windowMs: 60_000 })
      const third = await limiter.consume('key-a', { limit: 5, windowMs: 60_000 })

      expect(third.remaining).toBe(2)
    })

    it('refuses once the limit is exceeded', async () => {
      for (let i = 0; i < 3; i += 1) {
        await limiter.consume('key-a', { limit: 3, windowMs: 60_000 })
      }
      const fourth = await limiter.consume('key-a', { limit: 3, windowMs: 60_000 })

      expect(fourth.allowed).toBe(false)
      expect(fourth.remaining).toBe(0)
    })

    it('keeps two keys independent', async () => {
      for (let i = 0; i < 3; i += 1) {
        await limiter.consume('key-a', { limit: 3, windowMs: 60_000 })
      }
      const other = await limiter.consume('key-b', { limit: 3, windowMs: 60_000 })

      expect(other.allowed).toBe(true)
    })

    it('resets the count once the window passes', async () => {
      for (let i = 0; i < 3; i += 1) {
        await limiter.consume('key-a', { limit: 3, windowMs: 60_000 })
      }
      clock.advance(60_001)
      const afterWindow = await limiter.consume('key-a', { limit: 3, windowMs: 60_000 })

      expect(afterWindow.allowed).toBe(true)
      expect(afterWindow.remaining).toBe(2)
    })

    it('reports a resetAt in the future, no further away than one window', async () => {
      const result = await limiter.consume('key-a', { limit: 3, windowMs: 60_000 })

      expect(result.resetAt).toBeGreaterThan(clock.now())
      expect(result.resetAt).toBeLessThanOrEqual(clock.now() + 60_000)
    })

    it('clears a key on reset, so the next call starts a fresh count', async () => {
      for (let i = 0; i < 3; i += 1) {
        await limiter.consume('key-a', { limit: 3, windowMs: 60_000 })
      }
      await limiter.reset('key-a', 60_000)
      const afterReset = await limiter.consume('key-a', { limit: 3, windowMs: 60_000 })

      expect(afterReset.allowed).toBe(true)
      expect(afterReset.remaining).toBe(2)
    })

    it('is silent about resetting a key that was never consumed', async () => {
      await expect(limiter.reset('never-used', 60_000)).resolves.toBeUndefined()
    })

    it('accepts keys with Unicode and unusual characters', async () => {
      const result = await limiter.consume('apikey:été/日本語:キー', {
        limit: 3,
        windowMs: 60_000,
      })
      expect(result.allowed).toBe(true)
    })

    it('survives concurrent calls to the same key without losing a count', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => limiter.consume('hot', { limit: 100, windowMs: 60_000 })),
      )
      const remaining = results.map((r) => r.remaining).sort((a, b) => a - b)
      // Ten distinct decrements from 100, whatever order they land in.
      expect(remaining).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99])
    })
  })
}
