import { defineCollection, f } from '@cogenta/schema'
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

  it('accepts a published entry with no publication date, because its collection declares none', () => {
    // `publishedAt` is an ordinary contract A field, not a system column: a
    // collection that does not declare one gets `null` from `ContentStore` on
    // every entry, published or not. Refusing those made the whole package
    // emit `noindex` on a real site — found by wiring it to `cogenta serve`
    // (L10 task 1), never by a fixture, because every fixture set a date.
    expect(isPublished(makeEntry({ publishedAt: null }))).toBe(true)
    expect(isPublished(makeEntry({ publishedAt: null, status: 'draft' }))).toBe(false)
    expect(isPublished(makeEntry({ publishedAt: null, state: 'working' }))).toBe(false)
  })

  it('rejects an unparsable date rather than treating it as the epoch', () => {
    expect(isPublished(makeEntry({ publishedAt: 'not a date' }))).toBe(false)
  })

  it('requires a URL on top of publication', () => {
    expect(isIndexable(site, makeAuthor())).toBe(false)
    expect(isIndexable(site, makeArticle())).toBe(true)
  })
})

describe('canonical URLs with a category segment', () => {
  const categorised = defineCollection({
    name: 'categorised_article',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/blog/:category/:slug', locale: true },
    fields: {
      slug: f.slug({}),
      category: f.taxonomy({ of: 'topic', many: false }),
    },
    permissions: { read: ['public'] },
  })
  const resource = (categories?: Record<string, string>, term?: string) => ({
    collection: categorised,
    entry: makeEntry({
      values: { slug: 'hello', ...(term === undefined ? {} : { category: term }) },
    }),
    ...(categories === undefined ? {} : { categories }),
  })

  it('names the term slug the caller resolved, never the term id', () => {
    expect(canonicalUrl(site, resource({ category: 'devops' }, 'term-id-7'))).toBe(
      'https://example.com/en/blog/devops/hello',
    )
  })

  it('leaves the segment out of an entry that has no category', () => {
    expect(canonicalUrl(site, resource())).toBe('https://example.com/en/blog/hello')
    // An id the caller could not resolve must not leak into the address.
    expect(canonicalUrl(site, resource(undefined, 'term-id-7'))).toBe(
      'https://example.com/en/blog/hello',
    )
  })
})

describe('the address of the home page', () => {
  const pages = defineCollection({
    name: 'home_page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug', locale: true },
    fields: { slug: f.slug({}) },
    permissions: { read: ['public'] },
  })
  const home = { ...site, unprefixedDefaultLocale: true, homePath: '/home' }
  const page = (locale: string, slug: string) => ({
    collection: pages,
    entry: makeEntry({ locale, values: { slug } }),
  })

  it('is the site root, not the path the server redirects from', () => {
    expect(canonicalUrl(home, page('en', 'home'))).toBe('https://example.com/')
  })

  it('is the language root in another language', () => {
    expect(canonicalUrl(home, page('fr', 'home'))).toBe('https://example.com/fr/')
  })

  it('leaves every other page where it is', () => {
    expect(canonicalUrl(home, page('en', 'about'))).toBe('https://example.com/about')
    expect(canonicalUrl(home, page('fr', 'homes'))).toBe('https://example.com/fr/homes')
  })

  it('is the path itself when the site names no home path', () => {
    const { homePath: _homePath, ...unnamed } = home
    expect(canonicalUrl(unnamed, page('en', 'home'))).toBe('https://example.com/home')
  })
})
