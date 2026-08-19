import { describe, expect, it } from 'vitest'
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normaliseRecoveryCode,
  RECOVERY_CODE_COUNT,
  verifyRecoveryCode,
} from '../src/recovery-codes.js'

describe('generateRecoveryCodes', () => {
  it('generates ten codes by default', () => {
    expect(generateRecoveryCodes()).toHaveLength(RECOVERY_CODE_COUNT)
  })

  it('generates the requested count', () => {
    expect(generateRecoveryCodes(3)).toHaveLength(3)
  })

  it('never repeats a code within one batch', () => {
    const codes = generateRecoveryCodes(50)
    expect(new Set(codes).size).toBe(50)
  })

  it('shapes every code as two five-character groups, unambiguous alphabet', () => {
    for (const code of generateRecoveryCodes(20)) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
      expect(code).not.toMatch(/[01OIoi]/)
    }
  })
})

describe('normaliseRecoveryCode', () => {
  it('uppercases, strips the dash, and trims whitespace', () => {
    expect(normaliseRecoveryCode(' abcde-fghjk ')).toBe('ABCDEFGHJK')
  })

  it('strips stray punctuation a paste might carry along', () => {
    expect(normaliseRecoveryCode('ABCDE—FGHJK')).toBe('ABCDEFGHJK')
  })
})

describe('hashRecoveryCode / verifyRecoveryCode', () => {
  it('verifies the exact code that was hashed', async () => {
    const hash = await hashRecoveryCode('ABCDE-FGHJK')
    expect(await verifyRecoveryCode('ABCDE-FGHJK', hash)).toBe(true)
  })

  it('verifies the same code typed lowercase and without its dash', async () => {
    const hash = await hashRecoveryCode('ABCDE-FGHJK')
    expect(await verifyRecoveryCode('abcdefghjk', hash)).toBe(true)
  })

  it('rejects a different code', async () => {
    const hash = await hashRecoveryCode('ABCDE-FGHJK')
    expect(await verifyRecoveryCode('ZZZZZ-ZZZZZ', hash)).toBe(false)
  })

  it('produces a different hash for the same code on every call (fresh salt)', async () => {
    const a = await hashRecoveryCode('ABCDE-FGHJK')
    const b = await hashRecoveryCode('ABCDE-FGHJK')
    expect(a).not.toBe(b)
  })
})
