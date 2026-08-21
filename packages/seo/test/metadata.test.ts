import { describe, expect, it } from 'vitest'
import { buildHreflangMap } from '../src/hreflang.js'
import { buildMetaTags, type MetaTag, renderMetaTags } from '../src/metadata.js'
import type { SeoResolvers } from '../src/types.js'
import { makeArticle, makeAuthor, makePage, site } from './fixtures.js'

const resolvers: SeoResolvers = {
  media: () => ({
    url: 'https://cdn.example.com/cover.jpg',
    width: 1200,
    height: 630,
    alt: 'A cat',
  }),
}

function contentOf(tags: readonly MetaTag[], key: string): string | undefined {
  for (const tag of tags) {
    if (tag.kind === 'meta' && tag.name === key) return tag.content
    if (tag.kind === 'property' && tag.property === key) return tag.content
  }
  return undefined
}

function linksOf(tags: readonly MetaTag[], rel: string): readonly MetaTag[] {
  return tags.filter((tag) => tag.kind === 'link' && tag.rel === rel)
}

describe('canonical', () => {
  it('names the entry’s own absolute URL', () => {
    const tags = buildMetaTags(site, makeArticle())
    const canonical = linksOf(tags, 'canonical')[0]

    expect(canonical).toEqual({
      kind: 'link',
      rel: 'canonical',
      href: 'https://example.com/en/blog/hello-world',
    })
  })

  it('emits no canonical, and a noindex, for an unpublished entry', () => {
    const tags = buildMetaTags(site, makeArticle({ status: 'draft' }))

    expect(linksOf(tags, 'canonical')).toHaveLength(0)
    expect(contentOf(tags, 'robots')).toBe('noindex, nofollow')
  })

  it('honours an explicit noindex on a published entry', () => {
    const tags = buildMetaTags(site, makeArticle(), { noindex: true })

    expect(contentOf(tags, 'robots')).toBe('noindex, nofollow')
    expect(linksOf(tags, 'canonical')).toHaveLength(0)
  })

  it('emits no canonical for an entry with no URL', () => {
    expect(linksOf(buildMetaTags(site, makeAuthor()), 'canonical')).toHaveLength(0)
  })
})

describe('Open Graph and Twitter Card', () => {
  it('maps an article collection to og:type article, not to the schema.org type', () => {
    expect(contentOf(buildMetaTags(site, makeArticle()), 'og:type')).toBe('article')
    expect(contentOf(buildMetaTags(site, makePage()), 'og:type')).toBe('website')
  })

  it('carries title, description, url, locale and site name', () => {
    const tags = buildMetaTags(site, makeArticle())

    expect(contentOf(tags, 'og:title')).toBe('Hello world')
    expect(contentOf(tags, 'og:description')).toBe('A short summary.')
    expect(contentOf(tags, 'og:url')).toBe('https://example.com/en/blog/hello-world')
    expect(contentOf(tags, 'og:locale')).toBe('en')
    expect(contentOf(tags, 'og:site_name')).toBe('Example')
  })

  it('carries the article timestamps', () => {
    const tags = buildMetaTags(site, makeArticle())

    expect(contentOf(tags, 'article:published_time')).toBe('2026-01-15T09:00:00.000Z')
    expect(contentOf(tags, 'article:modified_time')).toBe('2026-02-01T12:00:00.000Z')
  })

  it('promises a large image card only when there is an image', () => {
    expect(contentOf(buildMetaTags(site, makeArticle()), 'twitter:card')).toBe('summary')
    expect(
      contentOf(
        buildMetaTags(site, makeArticle({ values: { cover: 'c' } }), { resolvers }),
        'twitter:card',
      ),
    ).toBe('summary_large_image')
  })

  it('carries the image dimensions and alt text when the resolver supplies them', () => {
    const tags = buildMetaTags(site, makeArticle({ values: { cover: 'c' } }), { resolvers })

    expect(contentOf(tags, 'og:image')).toBe('https://cdn.example.com/cover.jpg')
    expect(contentOf(tags, 'og:image:width')).toBe('1200')
    expect(contentOf(tags, 'og:image:alt')).toBe('A cat')
    expect(contentOf(tags, 'twitter:image:alt')).toBe('A cat')
  })

  it('truncates a description at the length search engines display', () => {
    const long = 'word '.repeat(100)
    const tags = buildMetaTags(site, makeArticle({ values: { excerpt: long } }))

    expect((contentOf(tags, 'description') ?? '').length).toBeLessThanOrEqual(160)
  })

  it('falls back to the site-wide default image when the entry has none of its own', () => {
    const tags = buildMetaTags(site, makeArticle(), {
      fallbackImage: { url: 'https://example.com/default-share.png' },
    })

    expect(contentOf(tags, 'og:image')).toBe('https://example.com/default-share.png')
    expect(contentOf(tags, 'twitter:card')).toBe('summary_large_image')
  })

  it('prefers the entry’s own image over the site-wide default', () => {
    const tags = buildMetaTags(site, makeArticle({ values: { cover: 'c' } }), {
      resolvers,
      fallbackImage: { url: 'https://example.com/default-share.png' },
    })

    expect(contentOf(tags, 'og:image')).toBe('https://cdn.example.com/cover.jpg')
  })

  it('lists only the other languages in og:locale:alternate', () => {
    const resources = [
      makeArticle({ id: 'src', locale: 'en', values: { slug: 'hello' } }),
      makeArticle({ id: 'fr', locale: 'fr', translationOf: 'src', values: { slug: 'bonjour' } }),
    ]
    const alternates = buildHreflangMap(site, resources).get('src') ?? []
    const tags = buildMetaTags(site, resources[0] as (typeof resources)[number], { alternates })

    const listed = tags
      .filter((tag) => tag.kind === 'property' && tag.property === 'og:locale:alternate')
      .map((tag) => (tag.kind === 'property' ? tag.content : ''))

    expect(listed).toEqual(['fr'])
  })
})

describe('hreflang link tags', () => {
  it('renders one alternate link per language, x-default included', () => {
    const resources = [
      makeArticle({ id: 'src', locale: 'en', values: { slug: 'hello' } }),
      makeArticle({ id: 'fr', locale: 'fr', translationOf: 'src', values: { slug: 'bonjour' } }),
    ]
    const alternates = buildHreflangMap(site, resources).get('src') ?? []
    const tags = buildMetaTags(site, resources[0] as (typeof resources)[number], { alternates })

    expect(
      linksOf(tags, 'alternate').map((tag) => (tag.kind === 'link' ? tag.hreflang : undefined)),
    ).toEqual(['en', 'fr', 'x-default'])
  })
})

describe('rendering tags to HTML', () => {
  it('escapes a title and an attribute value with the HTML entity set, not the XML one', () => {
    const tags = buildMetaTags(
      site,
      makeArticle({ values: { title: `Tom & Jerry <b>"best"</b> 'ever'` } }),
    )
    const html = renderMetaTags(tags)

    // `&apos;` is XML-only; HTML wants the numeric reference.
    expect(html).not.toContain('&apos;')
    expect(html).toContain('&#39;')
    expect(html).toContain('&amp;')
    expect(html).not.toMatch(/content="[^"]*<b>/u)
  })

  it('renders a link tag with its hreflang attribute', () => {
    const html = renderMetaTags([
      { kind: 'link', rel: 'alternate', href: 'https://example.com/fr/x', hreflang: 'fr' },
    ])

    expect(html).toBe('<link rel="alternate" hreflang="fr" href="https://example.com/fr/x" />')
  })

  it('escapes an ampersand in a canonical URL', () => {
    const html = renderMetaTags([
      { kind: 'link', rel: 'canonical', href: 'https://example.com/a?x=1&y=2' },
    ])

    expect(html).toContain('&amp;y=2')
  })
})
