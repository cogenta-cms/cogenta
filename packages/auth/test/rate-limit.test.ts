import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../src/rate-limit.js'
import { testDb } from './helpers/db.js'

describe('RateLimiter', () => {
  it('allows a subject with no history', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    await expect(limiter.check('alice@example.com')).resolves.toBeUndefined()
  })

  it('allows a handful of failures below the first threshold', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    for (let i = 0; i < 4; i += 1) await limiter.record('alice@example.com')
    await expect(limiter.check('alice@example.com')).resolves.toBeUndefined()
  })

  it('blocks once the failure count crosses the first threshold', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    for (let i = 0; i < 5; i += 1) await limiter.record('alice@example.com')

    await expect(limiter.check('alice@example.com')).rejects.toSatisfy(isCogentaError)
  })

  it('escalates the delay as failures climb through more thresholds', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    for (let i = 0; i < 20; i += 1) await limiter.record('alice@example.com')

    try {
      await limiter.check('alice@example.com')
      expect.unreachable()
    } catch (error) {
      expect(isCogentaError(error)).toBe(true)
      if (isCogentaError(error)) {
        expect(error.details?.retryAfterMs).toBe(15 * 60 * 1000)
      }
    }
  })

  it('does not block a different subject', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    for (let i = 0; i < 20; i += 1) await limiter.record('alice@example.com')

    await expect(limiter.check('bob@example.com')).resolves.toBeUndefined()
  })

  it('forgets attempts once cleared, on successful login', async () => {
    const db = await testDb()
    const limiter = createRateLimiter(db)
    for (let i = 0; i < 20; i += 1) await limiter.record('alice@example.com')

    await limiter.clear('alice@example.com')
    await expect(limiter.check('alice@example.com')).resolves.toBeUndefined()
  })

  it('only counts attempts inside the rolling window', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const limiter = createRateLimiter(db, () => clock)

    for (let i = 0; i < 10; i += 1) await limiter.record('alice@example.com')
    clock += 16 * 60 * 1000 // past the 15-minute window
    await expect(limiter.check('alice@example.com')).resolves.toBeUndefined()
  })
})
