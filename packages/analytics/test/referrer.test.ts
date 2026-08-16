import { describe, expect, it } from 'vitest'
import { extractReferrerDomain } from '../src/referrer.js'

describe('extractReferrerDomain', () => {
  it('extracts only the domain from a full referrer URL', () => {
    expect(extractReferrerDomain('https://www.example.com/search?q=secret+query&uid=1234')).toBe(
      'www.example.com',
    )
  })

  it('never returns the path, query string or fragment', () => {
    const domain = extractReferrerDomain('https://social.example/post/98765?token=abc#section')
    expect(domain).toBe('social.example')
    expect(domain).not.toContain('98765')
    expect(domain).not.toContain('token')
    expect(domain).not.toContain('abc')
  })

  it('returns undefined for a missing referrer', () => {
    expect(extractReferrerDomain(undefined)).toBeUndefined()
    expect(extractReferrerDomain(null)).toBeUndefined()
    expect(extractReferrerDomain('')).toBeUndefined()
  })

  it('returns undefined for an unparsable referrer', () => {
    expect(extractReferrerDomain('not a url')).toBeUndefined()
  })

  it('rejects non-http(s) schemes', () => {
    expect(extractReferrerDomain('javascript:alert(1)')).toBeUndefined()
    expect(extractReferrerDomain('file:///etc/passwd')).toBeUndefined()
  })

  it('drops a same-site referrer instead of recording internal navigation', () => {
    expect(
      extractReferrerDomain('https://my-site.example/other-page', 'my-site.example'),
    ).toBeUndefined()
  })

  it('keeps a cross-site referrer even when a site host is given', () => {
    expect(extractReferrerDomain('https://other.example/page', 'my-site.example')).toBe(
      'other.example',
    )
  })
})
