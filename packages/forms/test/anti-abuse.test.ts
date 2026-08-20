import { createMemoryRateLimiter } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  checkFillDelay,
  checkHoneypot,
  checkSubmitRateLimit,
  HONEYPOT_FIELD,
  TIMESTAMP_FIELD,
} from '../src/anti-abuse.js'

describe('checkHoneypot', () => {
  it('passes when the hidden field is empty', () => {
    expect(() => checkHoneypot({ [HONEYPOT_FIELD]: '' })).not.toThrow()
  })

  it('rejects when the hidden field was filled in — the bot signal', () => {
    expect(() => checkHoneypot({ [HONEYPOT_FIELD]: 'I am a bot' })).toThrow(
      expect.objectContaining({ code: 'FORM_HONEYPOT_TRIGGERED' }),
    )
  })
})

describe('checkFillDelay', () => {
  it('rejects a submission with no timestamp field at all', () => {
    expect(() => checkFillDelay({})).toThrow(
      expect.objectContaining({ code: 'FORM_SUBMITTED_TOO_FAST' }),
    )
  })

  it('rejects a submission that arrives faster than a human could fill the form', () => {
    const now = () => Date.parse('2026-01-01T00:00:05.000Z')
    const issuedAt = Date.parse('2026-01-01T00:00:04.500Z') // 0.5s later — a bot's speed
    expect(() => checkFillDelay({ [TIMESTAMP_FIELD]: String(issuedAt) }, now)).toThrow(
      expect.objectContaining({ code: 'FORM_SUBMITTED_TOO_FAST' }),
    )
  })

  it('accepts a submission that took a plausible amount of time', () => {
    const issuedAt = Date.parse('2026-01-01T00:00:00.000Z')
    const now = () => issuedAt + 10_000
    expect(() => checkFillDelay({ [TIMESTAMP_FIELD]: String(issuedAt) }, now)).not.toThrow()
  })

  it('rejects a stale timestamp from more than a day ago', () => {
    const issuedAt = Date.parse('2026-01-01T00:00:00.000Z')
    const now = () => issuedAt + 2 * 24 * 60 * 60 * 1000
    expect(() => checkFillDelay({ [TIMESTAMP_FIELD]: String(issuedAt) }, now)).toThrow()
  })
})

describe('checkSubmitRateLimit', () => {
  it('resists a submission loop from the same source (fiche 16 acceptance criterion)', async () => {
    const driver = createMemoryRateLimiter()
    for (let i = 0; i < 5; i += 1) {
      await expect(checkSubmitRateLimit(driver, 'contact', 'hash-a')).resolves.toBeUndefined()
    }
    await expect(checkSubmitRateLimit(driver, 'contact', 'hash-a')).rejects.toMatchObject({
      code: 'FORM_RATE_LIMITED',
    })
  })

  it('keeps two different sources independent', async () => {
    const driver = createMemoryRateLimiter()
    for (let i = 0; i < 5; i += 1) {
      await checkSubmitRateLimit(driver, 'contact', 'hash-a')
    }
    await expect(checkSubmitRateLimit(driver, 'contact', 'hash-b')).resolves.toBeUndefined()
  })

  it('keeps two different forms independent for the same source', async () => {
    const driver = createMemoryRateLimiter()
    for (let i = 0; i < 5; i += 1) {
      await checkSubmitRateLimit(driver, 'contact', 'hash-a')
    }
    await expect(checkSubmitRateLimit(driver, 'newsletter', 'hash-a')).resolves.toBeUndefined()
  })
})
