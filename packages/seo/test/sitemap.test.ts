import { describe, expect, it } from 'vitest'
import {
  buildSitemap,
  SITEMAP_MAX_BYTES,
  SITEMAP_MAX_URLS,
  type SitemapUrl,
  sitemapUrlsFor,
} from '../src/sitemap.js'
import { makeArticle, makeAuthor, makePage, site } from './fixtures.js'
import { findAll, parseXml, textOf } from './xml-parser.js'

function urls(count: number, prefix = 'https://example.com/p'): readonly SitemapUrl[] {
  return Array.from({ length: count }, (_, index) => ({
    loc: `${prefix}/${index}`,
    lastmod: '2026-02-01T12:00:00.000Z',
  }))
}

describe('sitemap generation', () => {
  it('produces one parsable file when the site is small', () => {
    const files = buildSitemap(site, urls(3))

    expect(files).toHaveLength(1)
    expect(files[0]?.path).toBe('/sitemap.xml')
    expect(files[0]?.isIndex).toBe(false)

    const root = parseXml(files[0]?.contents ?? '')
    expect(root.name).toBe('urlset')
    expect(root.attributes.xmlns).toBe('http://www.sitemaps.org/schemas/sitemap/0.9')
    expect(findAll(root, 'url')).toHaveLength(3)
  })

  it('keeps a URL containing an ampersand valid, unescaped in the parsed output', () => {
    const loc = 'https://example.com/search?q=cats&page=2'
    const files = buildSitemap(site, [{ loc }])

    expect(files[0]?.contents).toContain('&amp;page=2')
    expect(textOf(parseXml(files[0]?.contents ?? ''), 'loc')).toBe(loc)
  })

  it('splits into an index plus chunks once the URL limit is passed', () => {
    const files = buildSitemap(site, urls(7), { maxUrls: 3 })

    expect(files).toHaveLength(4)
    const [index, ...chunks] = files
    expect(index?.isIndex).toBe(true)
    expect(index?.path).toBe('/sitemap.xml')
    expect(chunks.map((file) => file.path)).toEqual([
      '/sitemap-1.xml',
      '/sitemap-2.xml',
      '/sitemap-3.xml',
    ])
    expect(chunks.map((file) => file.urlCount)).toEqual([3, 3, 1])
  })

  it('lists every chunk as an absolute URL in a parsable index', () => {
    const files = buildSitemap(site, urls(5), { maxUrls: 2 })
    const root = parseXml(files[0]?.contents ?? '')

    expect(root.name).toBe('sitemapindex')
    const locations = findAll(root, 'sitemap').map((entry) => textOf(entry, 'loc'))
    expect(locations).toEqual([
      'https://example.com/sitemap-1.xml',
      'https://example.com/sitemap-2.xml',
      'https://example.com/sitemap-3.xml',
    ])
  })

  it('loses no URL across the split', () => {
    const all = urls(250)
    const files = buildSitemap(site, all, { maxUrls: 40 })

    const emitted = files
      .filter((file) => !file.isIndex)
      .flatMap((file) => findAll(parseXml(file.contents), 'url').map((url) => textOf(url, 'loc')))

    expect(emitted).toEqual(all.map((url) => url.loc))
  })

  it('splits on the byte budget even when the URL count is well under the limit', () => {
    // Long URLs, a low byte cap: the URL limit is never reached, so only the
    // byte accounting can produce the split.
    const long = urls(20, `https://example.com/${'segment-'.repeat(20)}`)
    const files = buildSitemap(site, long, { maxBytes: 3_000 })

    expect(files.length).toBeGreaterThan(2)
    for (const file of files) {
      expect(Buffer.byteLength(file.contents, 'utf8')).toBeLessThanOrEqual(3_000)
      expect(() => parseXml(file.contents)).not.toThrow()
    }
  })

  it('holds every file under both protocol limits by default', () => {
    const files = buildSitemap(site, urls(120_000))

    for (const file of files) {
      expect(file.urlCount).toBeLessThanOrEqual(SITEMAP_MAX_URLS)
      expect(Buffer.byteLength(file.contents, 'utf8')).toBeLessThanOrEqual(SITEMAP_MAX_BYTES)
    }
    expect(files[0]?.isIndex).toBe(true)
    expect(files).toHaveLength(4)
  })

  it('refuses a single entry too large for any file rather than writing an invalid one', () => {
    expect(() => buildSitemap(site, urls(1), { maxBytes: 100 })).toThrow(
      /exceeds the 100-byte file limit/,
    )
  })

  it('does not treat the per-file URL cap as the index cap', () => {
    // Lowering maxUrls asks for more files; it must not also lower how many
    // files an index may list, or the split just requested becomes illegal.
    expect(() => buildSitemap(site, urls(20), { maxUrls: 2 })).not.toThrow()
    expect(buildSitemap(site, urls(20), { maxUrls: 2 })).toHaveLength(11)
  })

  it('refuses a site needing more files than one index can list', () => {
    expect(() => buildSitemap(site, urls(20), { maxUrls: 2, maxIndexEntries: 3 })).toThrow(
      /more than the 3 an index may list/,
    )
  })

  it('refuses a limit that cannot hold a URL', () => {
    expect(() => buildSitemap(site, urls(1), { maxUrls: 0 })).toThrow(/must allow at least one URL/)
  })
})

describe('sitemap URLs from content', () => {
  it('leaves out drafts, scheduled entries and archived entries', () => {
    const resources = [
      makeArticle({ values: { slug: 'published' } }),
      makeArticle({ status: 'draft', values: { slug: 'draft' } }),
      makeArticle({ status: 'scheduled', values: { slug: 'scheduled' } }),
      makeArticle({ status: 'archived', values: { slug: 'archived' } }),
    ]

    const locs = sitemapUrlsFor(site, resources).map((url) => url.loc)
    expect(locs).toEqual(['https://example.com/en/blog/published'])
  })

  it('leaves out an entry whose publication date is still in the future', () => {
    const resources = [
      makeArticle({ publishedAt: '2030-01-01T00:00:00.000Z', values: { slug: 'later' } }),
    ]

    expect(sitemapUrlsFor(site, resources, { now: new Date('2026-06-01') })).toEqual([])
  })

  it('leaves out an entry read from the working face, whose text nobody published', () => {
    const resources = [makeArticle({ state: 'working', values: { slug: 'wip' } })]

    expect(sitemapUrlsFor(site, resources)).toEqual([])
  })

  it('leaves out a collection that has no route, since it has no URL', () => {
    expect(sitemapUrlsFor(site, [makeAuthor()])).toEqual([])
  })

  it('leaves out an entry whose route parameter was never filled', () => {
    expect(sitemapUrlsFor(site, [makeArticle({ values: { slug: undefined } })])).toEqual([])
  })

  it('carries hreflang alternates into the sitemap, and parses', () => {
    const source = makeArticle({ id: 'src', locale: 'en', values: { slug: 'hello' } })
    const translation = makeArticle({
      id: 'fr',
      locale: 'fr',
      translationOf: 'src',
      values: { slug: 'bonjour' },
    })

    const files = buildSitemap(site, sitemapUrlsFor(site, [source, translation]))
    const root = parseXml(files[0]?.contents ?? '')

    expect(root.attributes['xmlns:xhtml']).toBe('http://www.w3.org/1999/xhtml')
    const links = findAll(root, 'xhtml:link')
    expect(links.map((link) => link.attributes.hreflang)).toEqual([
      'en',
      'fr',
      'x-default',
      'en',
      'fr',
      'x-default',
    ])
  })

  it('uses updatedAt as lastmod, which is what tells a crawler to come back', () => {
    const resource = makePage({ updatedAt: '2026-03-04T05:06:07.000Z' })
    expect(sitemapUrlsFor(site, [resource])[0]?.lastmod).toBe('2026-03-04T05:06:07.000Z')
  })
})

describe('per-collection sitemap overrides', () => {
  it('drops every URL of a collection explicitly excluded', () => {
    const resources = [
      makeArticle({ values: { slug: 'kept' } }),
      makePage({ values: { slug: 'dropped' } }),
    ]

    const locs = sitemapUrlsFor(site, resources, {
      collectionOverrides: { page: { included: false } },
    }).map((url) => url.loc)

    expect(locs).toEqual(['https://example.com/en/blog/kept'])
  })

  it('applies the collection changefreq and priority to every URL it contributes', () => {
    const resources = [makeArticle({ values: { slug: 'hello' } })]

    const [url] = sitemapUrlsFor(site, resources, {
      collectionOverrides: { article: { changefreq: 'weekly', priority: 0.8 } },
    })

    expect(url?.changefreq).toBe('weekly')
    expect(url?.priority).toBe(0.8)
  })

  it('leaves a collection with no override untouched', () => {
    const resources = [makeArticle({ values: { slug: 'hello' } })]

    const [url] = sitemapUrlsFor(site, resources, {
      collectionOverrides: { page: { included: false } },
    })

    expect(url?.changefreq).toBeUndefined()
    expect(url?.priority).toBeUndefined()
  })
})
