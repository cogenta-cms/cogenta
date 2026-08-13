import { describe, expect, it } from 'vitest'
import { feedItemsFor, renderAtomFeed, renderRssFeed, toRfc822 } from '../src/feeds.js'
import { makeArticle, makeAuthor, site } from './fixtures.js'
import { findAll, findFirst, parseXml, textOf } from './xml-parser.js'

const items = [
  {
    title: 'Cats & dogs <together>',
    link: 'https://example.com/en/blog/cats?a=1&b=2',
    id: 'https://example.com/en/blog/cats',
    updated: '2026-02-01T12:00:00.000Z',
    published: '2026-01-15T09:00:00.000Z',
    summary: `A summary with "quotes", 'apostrophes' & a <tag>.`,
    authorName: 'Ada Lovelace',
    categories: ['news & views'],
  },
]

describe('RSS', () => {
  it('produces a parsable feed', () => {
    const root = parseXml(renderRssFeed({ site, selfPath: '/rss.xml', items }))

    expect(root.name).toBe('rss')
    expect(root.attributes.version).toBe('2.0')
    expect(findAll(root, 'item')).toHaveLength(1)
  })

  it('escapes a title full of markup characters and reads it back unchanged', () => {
    const root = parseXml(renderRssFeed({ site, selfPath: '/rss.xml', items }))
    const item = findFirst(root, 'item')

    expect(textOf(item ?? root, 'title')).toBe('Cats & dogs <together>')
    expect(textOf(item ?? root, 'description')).toBe(items[0]?.summary)
  })

  it('escapes an ampersand in a link, which is where sitemaps and feeds usually break', () => {
    const feed = renderRssFeed({ site, selfPath: '/rss.xml', items })

    expect(feed).toContain('&amp;b=2')
    expect(textOf(findFirst(parseXml(feed), 'item') ?? parseXml(feed), 'link')).toBe(
      'https://example.com/en/blog/cats?a=1&b=2',
    )
  })

  it('carries an absolute self link, so a moved feed is still identifiable', () => {
    const root = parseXml(renderRssFeed({ site, selfPath: '/rss.xml', items }))
    const self = findFirst(root, 'atom:link')

    expect(self?.attributes.href).toBe('https://example.com/rss.xml')
    expect(self?.attributes.rel).toBe('self')
  })

  it('dates items in RFC 822 with a numeric offset, which every reader accepts', () => {
    expect(toRfc822('2026-01-15T09:00:00.000Z')).toBe('Thu, 15 Jan 2026 09:00:00 +0000')

    const root = parseXml(renderRssFeed({ site, selfPath: '/rss.xml', items }))
    expect(textOf(findFirst(root, 'item') ?? root, 'pubDate')).toBe(
      'Thu, 15 Jan 2026 09:00:00 +0000',
    )
  })

  it('never wraps content in CDATA, where a "]]>" in an article would corrupt the feed', () => {
    const feed = renderRssFeed({
      site,
      selfPath: '/rss.xml',
      items: [{ ...(items[0] as (typeof items)[number]), summary: 'about ]]> sequences' }],
    })

    expect(feed).not.toContain('CDATA')
    expect(() => parseXml(feed)).not.toThrow()
  })
})

describe('Atom', () => {
  it('produces a parsable feed with the Atom namespace', () => {
    const root = parseXml(renderAtomFeed({ site, selfPath: '/atom.xml', items }))

    expect(root.name).toBe('feed')
    expect(root.attributes.xmlns).toBe('http://www.w3.org/2005/Atom')
    expect(findAll(root, 'entry')).toHaveLength(1)
  })

  it('escapes a category term in an attribute position', () => {
    const root = parseXml(renderAtomFeed({ site, selfPath: '/atom.xml', items }))
    const category = findFirst(findFirst(root, 'entry') ?? root, 'category')

    expect(category?.attributes.term).toBe('news & views')
  })

  it('gives the feed a permanent id that is not its own URL', () => {
    const root = parseXml(renderAtomFeed({ site, selfPath: '/atom.xml', items }))

    expect(textOf(root, 'id')).toBe('https://example.com/')
  })

  it('uses the newest item date as the feed update time', () => {
    const root = parseXml(
      renderAtomFeed({
        site,
        selfPath: '/atom.xml',
        items: [
          { ...(items[0] as (typeof items)[number]), updated: '2026-02-01T12:00:00.000Z' },
          {
            ...(items[0] as (typeof items)[number]),
            id: 'https://example.com/other',
            updated: '2026-05-05T00:00:00.000Z',
          },
        ],
      }),
    )

    expect(textOf(root, 'updated')).toBe('2026-05-05T00:00:00.000Z')
  })
})

describe('feed items from content', () => {
  it('never lets a draft reach a feed, which cannot be retracted once fetched', () => {
    const resources = [
      makeArticle({ values: { title: 'Public', slug: 'public' } }),
      makeArticle({ status: 'draft', values: { title: 'Secret', slug: 'secret' } }),
      makeArticle({ state: 'working', values: { title: 'Unreviewed', slug: 'wip' } }),
      makeArticle({
        status: 'scheduled',
        values: { title: 'Later', slug: 'later' },
      }),
    ]

    const titles = feedItemsFor(site, resources).map((item) => item.title)
    expect(titles).toEqual(['Public'])
  })

  it('keeps a draft out of the rendered XML, not merely out of the item list', () => {
    const resources = [
      makeArticle({ values: { title: 'Public', slug: 'public' } }),
      makeArticle({ status: 'draft', values: { title: 'Secret', slug: 'secret' } }),
    ]

    const feed = renderRssFeed({ site, selfPath: '/rss.xml', items: feedItemsFor(site, resources) })
    expect(feed).not.toContain('Secret')
    expect(feed).not.toContain('secret')
  })

  it('orders newest first and honours the limit', () => {
    const resources = [
      makeArticle({ publishedAt: '2026-01-01T00:00:00.000Z', values: { title: 'Old', slug: 'a' } }),
      makeArticle({ publishedAt: '2026-06-01T00:00:00.000Z', values: { title: 'New', slug: 'b' } }),
      makeArticle({ publishedAt: '2026-03-01T00:00:00.000Z', values: { title: 'Mid', slug: 'c' } }),
    ]

    expect(feedItemsFor(site, resources, { limit: 2 }).map((item) => item.title)).toEqual([
      'New',
      'Mid',
    ])
  })

  it('skips a collection with no route, which has nothing to link to', () => {
    expect(feedItemsFor(site, [makeAuthor()])).toEqual([])
  })

  it('falls back to the body prose when the entry has no excerpt', () => {
    const resource = makeArticle({
      values: {
        slug: 'no-excerpt',
        excerpt: undefined,
        body: [
          {
            _key: 'k1',
            _type: 'block',
            style: 'normal',
            children: [{ _key: 's1', _type: 'span', text: 'Body prose here.', marks: [] }],
            markDefs: [],
          },
        ],
      },
    })

    expect(feedItemsFor(site, [resource])[0]?.summary).toBe('Body prose here.')
  })
})
