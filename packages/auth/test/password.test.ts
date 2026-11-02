import { randomBytes, scryptSync } from 'node:crypto'
import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { hashPassword, needsRehash, verifyPassword } from '../src/password.js'

describe('hashPassword / verifyPassword', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('salts every hash differently, even for the same password', async () => {
    const a = await hashPassword('same password')
    const b = await hashPassword('same password')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same password', a)).toBe(true)
    expect(await verifyPassword('same password', b)).toBe(true)
  })

  it('carries its cost parameters, so raising them later does not invalidate old hashes', async () => {
    const hash = await hashPassword('x')
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/)
  })

  it('normalises Unicode so a password typed on two keyboards still matches', async () => {
    // caf + LATIN SMALL LETTER E WITH ACUTE (NFC, one codepoint) versus
    // caf + "e" + COMBINING ACUTE ACCENT (NFD, two codepoints) — the same
    // text on screen, two different byte sequences on the wire.
    const nfc = `café`
    const nfd = `café`
    expect(nfd).not.toBe(nfc) // sanity: genuinely different strings before normalising
    expect(nfd.normalize('NFC')).toBe(nfc) // sanity: they are the same password

    const hash = await hashPassword(nfc)
    expect(await verifyPassword(nfd, hash)).toBe(true)
  })

  it.each(['', 'x'.repeat(513)])('refuses to hash an out-of-bounds password', async (password) => {
    await expect(hashPassword(password)).rejects.toSatisfy(isCogentaError)
  })

  it.each(['not-a-hash', 'scrypt$abc$8$1$salt$hash', 'scrypt$32768$8$1$$'])(
    'treats a malformed stored hash as a failed verification, never a throw',
    async (stored) => {
      await expect(verifyPassword('anything', stored)).resolves.toBe(false)
    },
  )

  it('rejects an empty or oversized attempt without hashing it', async () => {
    const hash = await hashPassword('x')
    expect(await verifyPassword('', hash)).toBe(false)
    expect(await verifyPassword('y'.repeat(600), hash)).toBe(false)
  })
})

/** A hash written the way `hashPassword` did before AUTH-04 (N=2^15, r=8, p=1). */
function legacyHash(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 128 * 2 ** 15 * 8 * 2,
  })
  return `scrypt$32768$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

describe('scrypt cost (pentest 2026-11-01, AUTH-04)', () => {
  it('hashes new passwords at the OWASP profile N=2^15, r=8, p=3', async () => {
    const [, N, r, p] = (await hashPassword('correct horse battery staple')).split('$')
    expect([Number(N), Number(r), Number(p)]).toEqual([32768, 8, 3])
  })

  it('still verifies a hash written with the previous parameters', async () => {
    expect(
      await verifyPassword(
        'correct horse battery staple',
        legacyHash('correct horse battery staple'),
      ),
    ).toBe(true)
  })

  it('asks for a rehash of a hash below the current parameters, and of nothing else', async () => {
    expect(needsRehash(legacyHash('x'))).toBe(true)
    expect(needsRehash(await hashPassword('x'))).toBe(false)
  })

  it('does not ask to rehash something that is not a hash at all', () => {
    expect(needsRehash('not-a-hash')).toBe(false)
  })
})
