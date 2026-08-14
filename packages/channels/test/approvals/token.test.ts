import { describe, expect, it } from 'vitest'
import {
  generateApprovalToken,
  hashApprovalToken,
  normalizeApprovalToken,
} from '../../src/approvals/token.js'

describe('approval token', () => {
  it('generates a 12-character token from the non-ambiguous alphabet', () => {
    const token = generateApprovalToken()
    expect(token).toHaveLength(12)
    expect(token).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
  })

  it('generates distinct tokens across calls', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateApprovalToken()))
    expect(tokens.size).toBe(50)
  })

  it('hashes case-insensitively and whitespace-tolerantly, like normalizeApprovalToken', () => {
    const token = generateApprovalToken()
    expect(hashApprovalToken(token.toLowerCase())).toBe(hashApprovalToken(token))
    expect(hashApprovalToken(` ${token} `)).toBe(hashApprovalToken(token))
  })

  it('normalizes to trimmed uppercase', () => {
    expect(normalizeApprovalToken(' abcd ')).toBe('ABCD')
  })
})
