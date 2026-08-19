import { describe, expect, it } from 'vitest'
import { indexableResources, isIndexable, isSeoNoindexed } from '../src/indexable.js'
import { buildMetaTags, type MetaTag } from '../src/metadata.js'
import { sitemapUrlsFor } from '../src/sitemap.js'
import type { SeoResolvers } from '../src/types.js'
import { makeArticle, makeSeoArticle, site } from './fixtures.js'

/**
 * Fiche 13 (SEO éditorial), Task 0 § decision (a): four conventional override
 * fields — `seoTitle`, `seoDescription`, `seoImage`, `seoNoindex` — plus the
 * "advanced, collapsed" `seoCanonical` field. None of them touch contract A:
 * `@cogenta/seo` reads them only when the collection declares an ordinary
 * field of that exact name, and every existing test in this package (over a
 * collection that declares none of them) is the proof the default path is
 * unchanged.
 */

const resolvers: SeoResolvers = {
  media: (id) => ({ url: `https://cdn.example.com/${id}.jpg`, width: 800, height: 600 }),
}

function contentOf(tags: readonly MetaTag[], key: string): string | undefined {
  for (const tag of tags) {
    if (tag.kind === 'meta' && tag.name === key) return tag.content
    if (tag.kind === 'property' && tag.property === key) return tag.content
  }
  return undefined
}

function titleOf(tags: readonly MetaTag[]): string | undefined {
  return tags.find((tag) => tag.kind === 'title')?.text
}

function canonicalOf(tags: readonly MetaTag[]): string | undefined {
  const link = tags.find((tag) => tag.kind === 'link' && tag.rel === 'canonical')
  return link?.kind === 'link' ? link.href : undefined
}

describe('a collection with no SEO override fields', () => {
  it('behaves exactly as before this fiche', () => {
    const tags = buildMetaTags(site, makeArticle())
    expect(titleOf(tags)).toBe('Hello world')
    expect(contentOf(tags, 'robots')).toBeUndefined()
  })
})

describe('seoTitle', () => {
  it('overrides the derived title verbatim, with no template applied', () => {
    const tags = buildMetaTags(
      site,
      makeSeoArticle({ values: { seoTitle: 'A hand-picked SEO title' } }),
      { titleTemplate: '%title% — %site%' },
    )
    expect(titleOf(tags)).toBe('A hand-picked SEO title')
  })

  it('falls back to the derived title when empty', () => {
    const tags = buildMetaTags(site, makeSeoArticle({ values: { seoTitle: '' } }))
    expect(titleOf(tags)).toBe('Hello world')
  })

  it('carries the override into og:title and twitter:title too', () => {
    const tags = buildMetaTags(site, makeSeoArticle({ values: { seoTitle: 'Shared title' } }))
    expect(contentOf(tags, 'og:title')).toBe('Shared title')
    expect(contentOf(tags, 'twitter:title')).toBe('Shared title')
  })
})

describe('title templates (Task 3)', () => {
  it('applies the site-wide template to a derived title only', () => {
    const tags = buildMetaTags(site, makeArticle(), { titleTemplate: '%title% — %site%' })
    expect(titleOf(tags)).toBe('Hello world — Example')
  })

  it('prefers a per-collection template over the site-wide one', () => {
    const tags = buildMetaTags(site, makeArticle(), {
      titleTemplate: '%title% — %site%',
      collectionTitleTemplates: { article: '%title% | Blog' },
    })
    expect(titleOf(tags)).toBe('Hello world | Blog')
  })

  it('never applies to an explicit options.title', () => {
    const tags = buildMetaTags(site, makeArticle(), {
      title: 'Exact title',
      titleTemplate: '%title% — %site%',
    })
    expect(titleOf(tags)).toBe('Exact title')
  })
})

describe('seoDescription', () => {
  it('overrides the derived excerpt', () => {
    const tags = buildMetaTags(
      site,
      makeSeoArticle({ values: { seoDescription: 'A hand-picked description.' } }),
    )
    expect(contentOf(tags, 'description')).toBe('A hand-picked description.')
  })

  it('still truncates a long manual description', () => {
    const long = 'word '.repeat(100)
    const tags = buildMetaTags(site, makeSeoArticle({ values: { seoDescription: long } }))
    expect((contentOf(tags, 'description') ?? '').length).toBeLessThanOrEqual(160)
  })
})

describe('seoImage', () => {
  it('is resolved ahead of every other media field', () => {
    const tags = buildMetaTags(
      site,
      makeSeoArticle({ values: { cover: 'cover-id', seoImage: 'share-id' } }),
      { resolvers },
    )
    expect(contentOf(tags, 'og:image')).toBe('https://cdn.example.com/share-id.jpg')
  })

  it('falls back to an ordinary media field when unset', () => {
    const tags = buildMetaTags(site, makeSeoArticle({ values: { cover: 'cover-id' } }), {
      resolvers,
    })
    expect(contentOf(tags, 'og:image')).toBe('https://cdn.example.com/cover-id.jpg')
  })
})

describe('seoNoindex', () => {
  it('forces noindex on an otherwise published, indexable entry', () => {
    const resource = makeSeoArticle({ values: { seoNoindex: true } })
    const tags = buildMetaTags(site, resource)

    expect(contentOf(tags, 'robots')).toBe('noindex, nofollow')
  })

  it('is what isSeoNoindexed reports, and only when the field is a boolean the entry set', () => {
    expect(isSeoNoindexed(makeSeoArticle({ values: { seoNoindex: true } }))).toBe(true)
    expect(isSeoNoindexed(makeSeoArticle({ values: { seoNoindex: false } }))).toBe(false)
    expect(isSeoNoindexed(makeArticle())).toBe(false)
  })

  it('removes the entry from isIndexable and from the sitemap — never noindex and listed in the same breath', () => {
    const resource = makeSeoArticle({ values: { seoNoindex: true } })
    expect(isIndexable(site, resource)).toBe(false)
    expect(indexableResources(site, [resource])).toHaveLength(0)
    expect(sitemapUrlsFor(site, [resource])).toHaveLength(0)
  })

  it('a non-noindexed entry from the same collection is still indexed', () => {
    const resource = makeSeoArticle({ values: { seoNoindex: false } })
    expect(isIndexable(site, resource)).toBe(true)
    expect(sitemapUrlsFor(site, [resource])).toHaveLength(1)
  })
})

describe('seoCanonical', () => {
  it('overrides the derived canonical URL, absolutised from a site-relative path', () => {
    const tags = buildMetaTags(
      site,
      makeSeoArticle({ values: { seoCanonical: '/blog/the-real-one' } }),
    )
    expect(canonicalOf(tags)).toBe('https://example.com/blog/the-real-one')
  })

  it('accepts an already-absolute URL verbatim', () => {
    const tags = buildMetaTags(
      site,
      makeSeoArticle({ values: { seoCanonical: 'https://other.example.com/x' } }),
    )
    expect(canonicalOf(tags)).toBe('https://other.example.com/x')
  })

  it('falls back to the derived canonical when blank', () => {
    const tags = buildMetaTags(site, makeSeoArticle({ values: { seoCanonical: '  ' } }))
    expect(canonicalOf(tags)).toBe('https://example.com/en/blog/hello-world')
  })

  it('does not change what the sitemap lists for this entry', () => {
    const resource = makeSeoArticle({ values: { seoCanonical: '/elsewhere' } })
    const urls = sitemapUrlsFor(site, [resource])
    expect(urls[0]?.loc).toBe('https://example.com/en/blog/hello-world')
  })
})
