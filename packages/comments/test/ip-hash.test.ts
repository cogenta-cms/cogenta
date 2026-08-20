import { describe, expect, it } from 'vitest'
import { hashIp } from '../src/ip-hash.js'

describe('hashIp', () => {
  it('is deterministic for the same secret and IP', () => {
    expect(hashIp('secret', '203.0.113.5')).toBe(hashIp('secret', '203.0.113.5'))
  })

  it('differs across secrets — a leaked hash is useless without the secret too', () => {
    expect(hashIp('secret-a', '203.0.113.5')).not.toBe(hashIp('secret-b', '203.0.113.5'))
  })

  it('never contains the raw IP as a substring', () => {
    const hash = hashIp('secret', '203.0.113.5')
    expect(hash).not.toContain('203.0.113.5')
  })

  it('is a 64-character hex string (sha256)', () => {
    expect(hashIp('secret', '203.0.113.5')).toMatch(/^[0-9a-f]{64}$/u)
  })
})
