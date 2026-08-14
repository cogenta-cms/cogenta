import { describe, expect, it } from 'vitest'
import { redactFields } from '../../src/privacy/redact-fields.js'

describe('redactFields', () => {
  it('redacts a top-level field named in the denylist', () => {
    const result = redactFields({ name: 'Jane', email: 'jane@example.com' }, ['email'])
    expect(result).toEqual({ name: 'Jane', email: '[REDACTED]' })
  })

  it('is case-insensitive when matching field names', () => {
    const result = redactFields({ Email: 'jane@example.com' }, ['email'])
    expect(result).toEqual({ Email: '[REDACTED]' })
  })

  it('redacts a nested field at any depth', () => {
    const result = redactFields({ user: { profile: { ssn: '123-45-6789' } } }, ['ssn'])
    expect(result).toEqual({ user: { profile: { ssn: '[REDACTED]' } } })
  })

  it('redacts a field inside array elements', () => {
    const result = redactFields({ users: [{ email: 'a@x.com' }, { email: 'b@x.com' }] }, ['email'])
    expect(result).toEqual({ users: [{ email: '[REDACTED]' }, { email: '[REDACTED]' }] })
  })

  it('leaves everything unchanged when the denylist is empty', () => {
    const data = { name: 'Jane', email: 'jane@example.com' }
    expect(redactFields(data, [])).toEqual(data)
  })

  it('does not redact a field whose name merely contains a denylisted word', () => {
    const result = redactFields({ emailVerifiedAt: '2026-01-01' }, ['email'])
    expect(result).toEqual({ emailVerifiedAt: '2026-01-01' })
  })
})
