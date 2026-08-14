import { describe, expect, it } from 'vitest'
import { generateLinkCode, hashLinkCode, normalizeCode } from '../../src/linking/codes.js'

describe('generateLinkCode', () => {
  it('produces an 8-character code from the unambiguous alphabet only', () => {
    const code = generateLinkCode()
    expect(code).toHaveLength(8)
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('is not a constant or predictable sequence across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateLinkCode()))
    expect(codes.size).toBe(50)
  })
})

describe('hashLinkCode / normalizeCode', () => {
  it("hashes case-insensitively and whitespace-tolerantly, matching verifyCode's own normalization", () => {
    expect(hashLinkCode('abcdefgh')).toBe(hashLinkCode('  ABCDEFGH  '))
  })

  it('never returns the raw code as its own hash', () => {
    const code = generateLinkCode()
    expect(hashLinkCode(code)).not.toBe(code)
    expect(hashLinkCode(code)).not.toContain(code)
  })

  it('normalizeCode trims and uppercases', () => {
    expect(normalizeCode('  abcd  ')).toBe('ABCD')
  })
})
