import { describe, expect, it } from 'vitest'
import { createUnlockTokens, MAX_UNLOCK_LIFETIME_SECONDS } from '../../src/access/unlock-token.js'

/**
 * L33 step 3 — what proves a visitor answered a page's password, and what
 * that proof deliberately cannot do.
 */

const KEY = 'a'.repeat(48)

describe('an unlock token', () => {
  it('opens the entry it was issued for, and only that one', () => {
    const tokens = createUnlockTokens({ signingKey: KEY })
    const token = tokens.issue('entry-a')

    expect(tokens.accepts('entry-a', token)).toBe(true)
    // The whole point: answering one page's password is not answering every
    // password on the site.
    expect(tokens.accepts('entry-b', token)).toBe(false)
  })

  it('is refused once it has expired', () => {
    let clock = 1_000_000
    const tokens = createUnlockTokens({
      signingKey: KEY,
      lifetimeSeconds: 60,
      now: () => clock,
    })
    const token = tokens.issue('entry-a')

    expect(tokens.accepts('entry-a', token)).toBe(true)
    clock += 61_000
    expect(tokens.accepts('entry-a', token)).toBe(false)
  })

  it('cannot be forged, edited or replayed from another site', () => {
    const tokens = createUnlockTokens({ signingKey: KEY })
    const token = tokens.issue('entry-a')
    const [payload = '', signature = ''] = token.split('.')

    // A payload changed to name another entry, keeping the old signature.
    const swapped = Buffer.from(
      JSON.stringify({ v: 'unlock.v1', entryId: 'entry-b', expiresAt: Date.now() + 60_000 }),
      'utf8',
    ).toString('base64url')
    expect(tokens.accepts('entry-b', `${swapped}.${signature}`)).toBe(false)

    // A signature from a different key: another Cogenta site's token is not a
    // key to this one.
    const elsewhere = createUnlockTokens({ signingKey: 'b'.repeat(48) })
    expect(tokens.accepts('entry-a', elsewhere.issue('entry-a'))).toBe(false)

    // Truncated, empty, and plain nonsense.
    expect(tokens.accepts('entry-a', payload)).toBe(false)
    expect(tokens.accepts('entry-a', '')).toBe(false)
    expect(tokens.accepts('entry-a', undefined)).toBe(false)
    expect(tokens.accepts('entry-a', 'not-a-token')).toBe(false)
  })

  it('names its cookie after a digest, never after the entry id', () => {
    const tokens = createUnlockTokens({ signingKey: KEY })

    const name = tokens.cookieName('01a0a6a4-2ecf-7000-9818-667bcea3e3ea')
    expect(name).not.toContain('01a0a6a4')
    expect(name).toMatch(/^cg_unlock_[0-9a-f]{16}$/u)
    // Stable, so a second visit finds the cookie it set.
    expect(tokens.cookieName('01a0a6a4-2ecf-7000-9818-667bcea3e3ea')).toBe(name)
  })

  it('never issues a token that outlives the ceiling', () => {
    let clock = 0
    const tokens = createUnlockTokens({
      signingKey: KEY,
      lifetimeSeconds: MAX_UNLOCK_LIFETIME_SECONDS * 10,
      now: () => clock,
    })
    const token = tokens.issue('entry-a')

    clock = MAX_UNLOCK_LIFETIME_SECONDS * 1000 + 1
    expect(tokens.accepts('entry-a', token)).toBe(false)
  })
})
