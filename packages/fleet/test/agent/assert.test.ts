import { describe, expect, it } from 'vitest'
import { assertNoForbiddenFields } from '../../src/agent/assert.js'

describe('assertNoForbiddenFields', () => {
  it('accepts a real, well-formed telemetry-shaped payload', () => {
    expect(() =>
      assertNoForbiddenFields({
        siteId: 'site-1',
        openCves: [{ id: 'CVE-2024-1', urgency: 'low', status: 'open' }],
        adminAccounts: { count: 2, mfaEnabledCount: 1 },
      }),
    ).not.toThrow()
  })

  it('catches a forbidden field smuggled in at the top level', () => {
    const smuggled = JSON.parse(
      JSON.stringify({ siteId: 'site-1', content: { title: 'a leaked article' } }),
    )
    expect(() => assertNoForbiddenFields(smuggled)).toThrowError(/content/)
  })

  it('catches a forbidden field smuggled in at any depth', () => {
    const smuggled = {
      siteId: 'site-1',
      adminAccounts: { count: 1, apiKey: 'sk-leaked' },
    }
    expect(() => assertNoForbiddenFields(smuggled)).toThrowError(/apiKey/)
  })

  it('catches a forbidden field inside an array element', () => {
    const smuggled = {
      openCves: [{ id: 'CVE-1', rawLogs: 'stack trace with a secret in it' }],
    }
    expect(() => assertNoForbiddenFields(smuggled)).toThrowError(/rawLogs/)
  })
})
