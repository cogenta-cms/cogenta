import { describe, expect, it } from 'vitest'
import { isIndexable, isPublished } from '../src/indexable.js'
import { absoluteUrl, canonicalUrl, normaliseBaseUrl } from '../src/url.js'
import { makeArticle, makeAuthor, makeEntry, makePage, site } from './fixtures.js'

describe('base URLs', () => {
  it('strips a trailing slash so a canonical never disagrees with a sitemap', () => {
    expect(normaliseBaseUrl('https://example.com/')).toBe('https://example.com')
    expect(normaliseBaseUrl('https://example.com/blog/')).toBe('https://example.com/blog')
  })

  it('refuses something that is not a URL', () => {
    expect(() => normaliseBaseUrl('example.com')).toThrow(/is not a URL/)
  })

  it('refuses a scheme no crawler follows', () => {
    expect(() => normaliseBaseUrl('ftp://example.com')).toThrow(/which no crawler follows/)
  })

  it('does not double-encode an already-escaped path', () => {
    expect(absoluteUrl(site, '/blog/caf%C3%A9')).toBe('https://example.com/blog/caf%C3%A9')
  })
})

describe('canonical URLs', () => {
  it('prefixes the locale on a localised route', () => {
    expect(canonicalUrl(site, makeArticle())).toBe('https://example.com/en/blog/hello-world')
  })

  it('leaves an unlocalised route alone', () => {
    expect(canonicalUrl(site, makePage())).toBe('https://example.com/about')
  })

  it('drops the default locale prefix when the site serves it unprefixed', () => {
    const unprefixed = { ...site, unprefixedDefaultLocale: true }

    expect(canonicalUrl(unprefixed, makeArticle())).toBe('https://example.com/blog/hello-world')
    expect(canonicalUrl(unprefixed, makeArticle({ locale: 'fr' }))).toBe(
      'https://example.com/fr/blog/hello-world',
    )
  })

  it('returns null for a collection with no route', () => {
    expect(canonicalUrl(site, makeAuthor())).toBeNull()
  })

  it('returns null when a route parameter is missing rather than building a 404', () => {
    expect(canonicalUrl(site, makeArticle({ values: { slug: undefined } }))).toBeNull()
  })

  it('percent-encodes a slug carrying an awkward character', () => {
    expect(canonicalUrl(site, makeArticle({ values: { slug: 'r&d' } }))).toBe(
      'https://example.com/en/blog/r%26d',
    )
  })
})

describe('the publication gate', () => {
  it('accepts only a published entry read from the published face', () => {
    expect(isPublished(makeEntry())).toBe(true)
    expect(isPublished(makeEntry({ status: 'draft' }))).toBe(false)
    expect(isPublished(makeEntry({ status: 'scheduled' }))).toBe(false)
    expect(isPublished(makeEntry({ status: 'archived' }))).toBe(false)
    expect(isPublished(makeEntry({ state: 'working' }))).toBe(false)
  })

  it('rejects a published entry whose date has not arrived', () => {
    const entry = makeEntry({ publishedAt: '2030-01-01T00:00:00.000Z' })

    expect(isPublished(entry, { now: new Date('2026-01-01') })).toBe(false)
    expect(isPublished(entry, { now: new Date('2031-01-01') })).toBe(true)
  })

  it('rejects a published entry with no publication date at all', () => {
    expect(isPublished(makeEntry({ publishedAt: null }))).toBe(false)
  })

  it('rejects an unparsable date rather than treating it as the epoch', () => {
    expect(isPublished(makeEntry({ publishedAt: 'not a date' }))).toBe(false)
  })

  it('requires a URL on top of publication', () => {
    expect(isIndexable(site, makeAuthor())).toBe(false)
    expect(isIndexable(site, makeArticle())).toBe(true)
  })
})
