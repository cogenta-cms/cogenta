import { describe, expect, it } from 'vitest'
import { redactText } from '../../src/privacy/redact-text.js'

describe('redactText', () => {
  it('redacts an email address', () => {
    const result = redactText('Contact us at jane.doe@example.com for details.')
    expect(result.text).toBe('Contact us at [REDACTED:email] for details.')
    expect(result.matches).toEqual([{ kind: 'email', value: 'jane.doe@example.com', index: 14 }])
  })

  it('redacts an IPv4 address', () => {
    const result = redactText('The request came from 192.168.1.42.')
    expect(result.text).toBe('The request came from [REDACTED:ip_address].')
  })

  it('redacts a credit card number, grouped in fours', () => {
    const result = redactText('Card: 4111 1111 1111 1111')
    expect(result.text).toBe('Card: [REDACTED:credit_card]')
  })

  it('redacts a phone number', () => {
    const result = redactText('Call +1 415 555 0132 for support.')
    expect(result.text).toContain('[REDACTED:phone]')
    expect(result.text).not.toContain('415')
  })

  it('leaves ordinary text untouched', () => {
    const result = redactText('This is a perfectly normal sentence.')
    expect(result.text).toBe('This is a perfectly normal sentence.')
    expect(result.matches).toEqual([])
  })

  it('redacts more than one match of the same kind', () => {
    const result = redactText('Emails: a@example.com and b@example.com.')
    expect(result.text).toBe('Emails: [REDACTED:email] and [REDACTED:email].')
    expect(result.matches).toHaveLength(2)
  })
})
