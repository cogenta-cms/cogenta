import { describe, expect, it } from 'vitest'
import { createUnlockTokens, MAX_UNLOCK_LIFETIME_SECONDS } from '../../src/access/unlock-token.js'

/**
 * L33 step 3 — what proves a visitor answered a page's password, and what
 * that proof deliberately cannot do.
 */

const KEY = 'a'.repeat(48)
const PW = 'ffffffffffffffff'

describe('an unlock token', () => {
  it('opens the entry it was issued for, and only that one', () => {
    const tokens = createUnlockTokens({ signingKey: KEY })
    const token = tokens.issue('entry-a', PW)

    expect(tokens.accepts('entry-a', token, PW)).toBe(true)
    // The whole point: answering one page's password is not answering every
    // password on the site.
    expect(tokens.accepts('entry-b', token, PW)).toBe(false)
  })

  it('is refused once it has expired', () => {
    let clock = 1_000_000
    const tokens = createUnlockTokens({
      signingKey: KEY,
      lifetimeSeconds: 60,
      now: () => clock,
    })
    const token = tokens.issue('entry-a', PW)

    expect(tokens.accepts('entry-a', token, PW)).toBe(true)
    clock += 61_000
    expect(tokens.accepts('entry-a', token, PW)).toBe(false)
  })

  it('cannot be forged, edited or replayed from another site', () => {
    const tokens = createUnlockTokens({ signingKey: KEY })
    const token = tokens.issue('entry-a', PW)
    const [payload = '', signature = ''] = token.split('.')

    // A payload changed to name another entry, keeping the old signature.
    const swapped = Buffer.from(
      JSON.stringify({
        v: 'unlock.v2',
        entryId: 'entry-b',
        pw: PW,
        expiresAt: Date.now() + 60_000,
      }),
      'utf8',
    ).toString('base64url')
    expect(tokens.accepts('entry-b', `${swapped}.${signature}`, PW)).toBe(false)

    // A signature from a different key: another Cogenta site's token is not a
    // key to this one.
    const elsewhere = createUnlockTokens({ signingKey: 'b'.repeat(48) })
    expect(tokens.accepts('entry-a', elsewhere.issue('entry-a', PW), PW)).toBe(false)

    // Truncated, empty, and plain nonsense.
    expect(tokens.accepts('entry-a', payload, PW)).toBe(false)
    expect(tokens.accepts('entry-a', '', PW)).toBe(false)
    expect(tokens.accepts('entry-a', undefined, PW)).toBe(false)
    expect(tokens.accepts('entry-a', 'not-a-token', PW)).toBe(false)
  })

  it('stops opening the entry once the password it was earned with has changed', () => {
    const tokens = createUnlockTokens({ signingKey: KEY })
    const before = tokens.versionOf('scrypt$old-hash')
    const after = tokens.versionOf('scrypt$new-hash')
    const token = tokens.issue('entry-a', before)

    expect(before).not.toBe(after)
    expect(tokens.accepts('entry-a', token, before)).toBe(true)
    expect(tokens.accepts('entry-a', token, after)).toBe(false)
  })

  it('carries a version that does not reveal the stored hash', () => {
    const tokens = createUnlockTokens({ signingKey: KEY })
    const version = tokens.versionOf('scrypt$secret-hash-material')

    expect(version).toMatch(/^[0-9a-f]{16}$/u)
    expect(tokens.issue('entry-a', version)).not.toContain('secret-hash-material')
    // Keyed: another site derives another version from the same hash.
    expect(
      createUnlockTokens({ signingKey: 'b'.repeat(48) }).versionOf('scrypt$secret-hash-material'),
    ).not.toBe(version)
  })

  it('reports what a valid token claims, and nothing for a forged one', () => {
    const tokens = createUnlockTokens({ signingKey: KEY })

    expect(tokens.claims(tokens.issue('entry-a', PW))).toEqual({
      entryId: 'entry-a',
      passwordVersion: PW,
    })
    expect(tokens.claims('forged.payload')).toBeNull()
    expect(tokens.claims(undefined)).toBeNull()
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
    const token = tokens.issue('entry-a', PW)

    clock = MAX_UNLOCK_LIFETIME_SECONDS * 1000 + 1
    expect(tokens.accepts('entry-a', token, PW)).toBe(false)
  })
})
