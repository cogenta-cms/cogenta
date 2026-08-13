import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { buildPath, matchPath, normalisePath } from '../../src/routing/router.js'
import type { CollectionDefinition } from '../../src/types.js'

function codeOf(run: () => unknown): string {
  try {
    run()
    return 'nothing was thrown'
  } catch (error) {
    return isCogentaError(error) ? error.code : `a plain ${String(error)}`
  }
}

const article: CollectionDefinition = {
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  fields: {},
  permissions: { read: ['public'] },
}

const page: CollectionDefinition = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {},
  permissions: { read: ['public'] },
}

const author: CollectionDefinition = {
  name: 'author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: {},
  permissions: { read: ['public'] },
}

const locales = ['fr', 'en'] as const

describe('normalisePath', () => {
  it('drops the trailing slash, the query and the fragment', () => {
    expect(normalisePath('/blog/hello/')).toBe('/blog/hello')
    expect(normalisePath('/blog/hello?utm=x')).toBe('/blog/hello')
    expect(normalisePath('/blog/hello#here')).toBe('/blog/hello')
  })

  it('keeps the root a root', () => {
    expect(normalisePath('/')).toBe('/')
    expect(normalisePath('')).toBe('/')
  })
})

describe('buildPath', () => {
  it('prefixes the locale when the collection is routed by locale', () => {
    expect(buildPath(article, { slug: 'bonjour' }, 'fr')).toBe('/fr/blog/bonjour')
  })

  it('leaves an unlocalised route unprefixed', () => {
    expect(buildPath(page, { slug: 'contact' })).toBe('/contact')
  })

  it('percent-encodes a parameter that is not URL-safe', () => {
    expect(buildPath(page, { slug: 'r&d' })).toBe('/r%26d')
  })

  it('refuses to build a localised URL without a locale', () => {
    expect(codeOf(() => buildPath(article, { slug: 'bonjour' }))).toBe('CONTENT_ROUTE_INVALID')
  })

  it('names the parameter it is missing', () => {
    expect(codeOf(() => buildPath(article, {}, 'fr'))).toBe('CONTENT_ROUTE_INVALID')
  })

  it('refuses a collection that has no route', () => {
    expect(codeOf(() => buildPath(author, { slug: 'ada' }))).toBe('CONTENT_ROUTE_INVALID')
  })
})

describe('matchPath', () => {
  it('reads the locale off the prefix', () => {
    expect(matchPath([article], '/fr/blog/bonjour', { locales })).toEqual({
      collection: 'article',
      locale: 'fr',
      params: { slug: 'bonjour' },
    })
  })

  it('falls back to the default locale when the prefix is absent', () => {
    expect(matchPath([article], '/blog/hello', { locales, defaultLocale: 'en' })).toEqual({
      collection: 'article',
      locale: 'en',
      params: { slug: 'hello' },
    })
  })

  it('refuses an unprefixed localised URL when the site has no unprefixed locale', () => {
    expect(matchPath([article], '/blog/hello', { locales })).toBeNull()
  })

  it('does not mistake a known slug for a locale', () => {
    // "en" is a locale, but /blog/en asks for an article whose slug is "en".
    expect(matchPath([article], '/blog/en', { locales, defaultLocale: 'fr' })).toEqual({
      collection: 'article',
      locale: 'fr',
      params: { slug: 'en' },
    })
  })

  it('reports no locale for a collection that is not localised', () => {
    expect(matchPath([page], '/contact', { locales })).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'contact' },
    })
  })

  it('tries collections in the order given, so the specific pattern is declared first', () => {
    expect(
      matchPath([article, page], '/fr/blog/bonjour', { locales, defaultLocale: 'fr' }),
    ).toEqual({
      collection: 'article',
      locale: 'fr',
      params: { slug: 'bonjour' },
    })
  })

  it('ignores a collection with no route at all', () => {
    expect(matchPath([author], '/ada', { locales })).toBeNull()
  })

  it('decodes a percent-encoded segment back into the stored slug', () => {
    expect(matchPath([page], '/r%26d', { locales })?.params).toEqual({ slug: 'r&d' })
  })

  it('matches nothing when the path has too many segments', () => {
    expect(matchPath([page], '/blog/hello/again', { locales, defaultLocale: 'fr' })).toBeNull()
  })

  it('is indifferent to a trailing slash', () => {
    expect(matchPath([article], '/fr/blog/bonjour/', { locales })?.params).toEqual({
      slug: 'bonjour',
    })
  })
})
