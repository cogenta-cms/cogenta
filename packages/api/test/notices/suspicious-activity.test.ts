import { createRateLimiter, ensureAuthTables, type RateLimiter } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createSuspiciousActivitySource,
  SUSPICIOUS_ACTIVITY_ID,
} from '../../src/notices/suspicious-activity.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * A real limiter over a real database throughout: the point of the source is
 * what it says about attempts that really happened.
 */
let db: DatabaseHandle
let rateLimit: RateLimiter

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  await ensureAuthTables(db)
  rateLimit = createRateLimiter(db)
})

afterEach(async () => {
  await db.close()
})

const ADMIN = { id: 'admin-1', roles: ['admin'] }
const EDITOR = { id: 'editor-1', roles: ['editor'] }

async function fail(subject: string, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) await rateLimit.record(subject)
}

describe('the suspicious activity notice', () => {
  it('says nothing when nobody is guessing passwords', async () => {
    const source = createSuspiciousActivitySource({ rateLimit })
    await fail('alice@example.com', 2)

    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('warns an admin once the attempts cross the backoff threshold', async () => {
    const source = createSuspiciousActivitySource({ rateLimit })
    await fail('alice@example.com', 9)

    const [notice] = await source.list({ actor: ADMIN })

    expect(notice).toMatchObject({
      id: SUSPICIOUS_ACTIVITY_ID,
      severity: 'danger',
      dismissible: false,
      params: { attempts: '9', subjects: '1' },
    })
  })

  it('adds up every targeted account into one notice', async () => {
    const source = createSuspiciousActivitySource({ rateLimit })
    await fail('alice@example.com', 6)
    await fail('bob@example.com', 8)

    const notices = await source.list({ actor: ADMIN })

    expect(notices).toHaveLength(1)
    expect(notices[0]?.params).toEqual({ attempts: '14', subjects: '2' })
  })

  it('never names the accounts being targeted', async () => {
    const source = createSuspiciousActivitySource({ rateLimit })
    await fail('alice@example.com', 9)

    const serialised = JSON.stringify(await source.list({ actor: ADMIN }))

    expect(serialised).not.toContain('alice')
    expect(serialised).not.toContain('example.com')
  })

  it('tells nothing to an editor or to a stranger', async () => {
    const source = createSuspiciousActivitySource({ rateLimit })
    await fail('alice@example.com', 30)

    expect(await source.list({ actor: EDITOR })).toEqual([])
    expect(await source.list({ actor: ANONYMOUS })).toEqual([])
  })

  it('is a warning rather than a danger below the backoff threshold', async () => {
    const source = createSuspiciousActivitySource({ rateLimit, minAttempts: 2 })
    await fail('alice@example.com', 3)

    expect((await source.list({ actor: ADMIN }))[0]?.severity).toBe('warning')
  })

  it('cannot be dismissed, so it comes back for the next attack', async () => {
    const source = createSuspiciousActivitySource({ rateLimit })
    await fail('alice@example.com', 9)

    expect((await source.list({ actor: ADMIN }))[0]?.dismissible).toBe(false)
  })

  it('points at somewhere an admin can look further', async () => {
    const source = createSuspiciousActivitySource({ rateLimit, auditHref: '/audit-log' })
    await fail('alice@example.com', 9)

    expect((await source.list({ actor: ADMIN }))[0]?.action?.href).toBe('/audit-log')
  })
})
