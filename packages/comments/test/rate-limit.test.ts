import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCommentRateLimiter } from '../src/rate-limit.js'
import { testDb } from './helpers/db.js'

describe('CommentRateLimiter', () => {
  let db: Awaited<ReturnType<typeof testDb>>

  beforeEach(async () => {
    db = await testDb()
  })

  afterEach(async () => {
    await db.close()
  })

  it('resists a submission loop from a single IP', async () => {
    const limiter = createCommentRateLimiter(db)
    for (let i = 0; i < 5; i += 1) {
      await limiter.check({ ipHash: 'ip-1', target: 'post:e1' })
      await limiter.record({ ipHash: 'ip-1', target: 'post:e1' })
    }
    await expect(limiter.check({ ipHash: 'ip-1', target: 'post:e1' })).rejects.toMatchObject({
      code: 'COMMENT_RATE_LIMITED',
    })
  })

  it('is scoped per IP — a different visitor is unaffected', async () => {
    const limiter = createCommentRateLimiter(db)
    for (let i = 0; i < 5; i += 1) {
      await limiter.record({ ipHash: 'ip-1', target: 'post:e1' })
    }
    await expect(limiter.check({ ipHash: 'ip-2', target: 'post:e2' })).resolves.toBeUndefined()
  })

  it('also limits by target — a distributed flood against one popular entry', async () => {
    const limiter = createCommentRateLimiter(db)
    for (let i = 0; i < 20; i += 1) {
      await limiter.record({ ipHash: `ip-${i}`, target: 'post:popular' })
    }
    await expect(limiter.check({ ipHash: 'ip-new', target: 'post:popular' })).rejects.toMatchObject(
      { code: 'COMMENT_RATE_LIMITED' },
    )
  })

  it('an old attempt outside the window no longer counts', async () => {
    let now = Date.parse('2026-01-01T00:00:00Z')
    const limiter = createCommentRateLimiter(db, () => now)
    for (let i = 0; i < 5; i += 1) {
      await limiter.record({ ipHash: 'ip-1', target: 'post:e1' })
    }
    now += 11 * 60 * 1000
    await expect(limiter.check({ ipHash: 'ip-1', target: 'post:e1' })).resolves.toBeUndefined()
  })
})
