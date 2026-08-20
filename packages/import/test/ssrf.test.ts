import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { assertPublicUrl, isPrivateAddress } from '../src/ssrf.js'

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.0.0.5', true],
    ['172.16.0.1', true],
    ['192.168.1.1', true],
    ['169.254.169.254', true], // cloud instance metadata
    ['0.0.0.0', true],
    ['::1', true],
    ['8.8.8.8', false],
    ['93.184.216.34', false],
  ])('classifies %s as private=%s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected)
  })
})

describe('assertPublicUrl', () => {
  it('refuses a literal loopback address without needing DNS', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/x')).rejects.toThrow(CogentaError)
  })

  it('refuses the "localhost" host name', async () => {
    await expect(assertPublicUrl('http://localhost:5432/')).rejects.toThrow(CogentaError)
  })

  it('refuses a non-http(s) protocol', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(CogentaError)
  })

  it('refuses an unparseable URL', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toThrow(CogentaError)
  })

  it('refuses a host name that resolves to a private address (DNS rebinding)', async () => {
    const lookupImpl = (async () => [{ address: '169.254.169.254', family: 4 }]) as never
    await expect(
      assertPublicUrl('http://attacker.example/img.jpg', { lookupImpl }),
    ).rejects.toThrow(CogentaError)
  })

  it('accepts a host name that resolves only to public addresses', async () => {
    const lookupImpl = (async () => [{ address: '93.184.216.34', family: 4 }]) as never
    await expect(
      assertPublicUrl('http://example.com/img.jpg', { lookupImpl }),
    ).resolves.toBeUndefined()
  })

  it('refuses when the host name cannot be resolved at all', async () => {
    const lookupImpl = (async () => {
      throw new Error('ENOTFOUND')
    }) as never
    await expect(assertPublicUrl('http://nowhere.invalid/x', { lookupImpl })).rejects.toThrow(
      CogentaError,
    )
  })
})
