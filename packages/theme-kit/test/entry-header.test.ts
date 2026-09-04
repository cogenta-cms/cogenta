import type { VocabularyBlock } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import type { RenderContext } from '../src/contract.js'
import { renderEntryHeader } from '../src/entry-header.js'
import { serialize } from '../src/html.js'
import type { PageContent } from '../src/page.js'

/** Renders the header and asserts it is not `null` in one place, so every test below stays a plain string assertion. */
function headerHtml(page: PageContent, ctx: RenderContext): string {
  const header = renderEntryHeader(page, ctx)
  expect(header).not.toBeNull()
  if (header === null) throw new Error('unreachable — asserted above')
  return serialize(header)
}

function fakeContext(): RenderContext {
  return {
    site: { name: 'Site', url: 'https://example.com', locales: ['en'], defaultLocale: 'en' },
    locale: 'en',
    url: new URL('https://example.com/'),
    t: (key, values) => (values === undefined ? key : `${key}:${JSON.stringify(values)}`),
    image: (media) => ({
      kind: 'image',
      src: `/_image?id=${media}`,
      srcset: '',
      width: 800,
      height: 400,
      alt: 'cover',
      focal: null,
    }),
    link: () => '#',
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}

const PROSE_BLOCKS: readonly VocabularyBlock[] = [
  { _key: 'k1', _type: 'prose', _version: '1.0.0', body: [] } as unknown as VocabularyBlock,
]

const HERO_BLOCKS: readonly VocabularyBlock[] = [
  {
    _key: 'k1',
    _type: 'hero',
    _version: '1.0.0',
    title: 'Hero title',
    headingLevel: 'h1',
  } as unknown as VocabularyBlock,
]

describe('renderEntryHeader', () => {
  it('returns null when the page carries no entry meta', () => {
    const page: PageContent = { title: 'Untitled', blocks: PROSE_BLOCKS }
    expect(renderEntryHeader(page, fakeContext())).toBeNull()
  })

  it('returns null when a hero block already draws its own h1, even with entry meta present', () => {
    const page: PageContent = {
      title: 'Hero title',
      blocks: HERO_BLOCKS,
      entry: { collection: 'page' },
    }
    expect(renderEntryHeader(page, fakeContext())).toBeNull()
  })

  it('renders a header with the title when entry meta is present and no hero exists', () => {
    const page: PageContent = {
      title: 'My article',
      blocks: PROSE_BLOCKS,
      entry: { collection: 'post' },
    }
    const header = renderEntryHeader(page, fakeContext())
    expect(header?.tag).toBe('header')
    const html = headerHtml(page, fakeContext())
    expect(html).toContain('<h1 class="cg-entry-header__title">My article</h1>')
  })

  it('omits the meta line entirely when the entry carries none of date/author/reading time', () => {
    const page: PageContent = {
      title: 'My article',
      blocks: PROSE_BLOCKS,
      entry: { collection: 'post' },
    }
    const html = headerHtml(page, fakeContext())
    expect(html).not.toContain('cg-entry-header__meta')
  })

  it('renders the date, author and reading time together in the meta line', () => {
    const page: PageContent = {
      title: 'My article',
      blocks: PROSE_BLOCKS,
      entry: {
        collection: 'post',
        publishedAt: '2026-01-15T10:00:00.000Z',
        author: { name: 'Ada Lovelace' },
        readingMinutes: 4,
      },
    }
    const html = headerHtml(page, fakeContext())
    expect(html).toContain('cg-entry-header__meta')
    expect(html).toContain('datetime="2026-01-15T10:00:00.000Z"')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('entry.readingTime')
  })

  it('renders classified terms as a linked eyebrow list, unresolved terms as plain text', () => {
    const page: PageContent = {
      title: 'My article',
      blocks: PROSE_BLOCKS,
      entry: {
        collection: 'post',
        terms: [
          { taxonomy: 'category', label: 'News', href: '/category/news' },
          { taxonomy: 'category', label: 'Orphan', href: null },
        ],
      },
    }
    const html = headerHtml(page, fakeContext())
    expect(html).toContain('cg-entry-header__terms')
    expect(html).toContain('<a href="/category/news">News</a>')
    expect(html).toContain('Orphan')
    expect(html).not.toContain('<a href="null">')
  })

  it('renders the excerpt as plain text, escaped', () => {
    const page: PageContent = {
      title: 'My article',
      blocks: PROSE_BLOCKS,
      entry: { collection: 'post', excerpt: '<b>bold</b> claim' },
    }
    const html = headerHtml(page, fakeContext())
    expect(html).toContain('cg-entry-header__excerpt')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('renders the already-resolved cover image without calling ctx.image again', () => {
    let calls = 0
    const ctx: RenderContext = {
      ...fakeContext(),
      image: (media) => {
        calls += 1
        return {
          kind: 'image',
          src: `/_image?id=${media}`,
          srcset: '',
          width: 10,
          height: 10,
          alt: '',
          focal: null,
        }
      },
    }
    const page: PageContent = {
      title: 'My article',
      blocks: PROSE_BLOCKS,
      entry: {
        collection: 'post',
        image: {
          kind: 'image',
          src: '/_image?id=cover',
          srcset: '',
          width: 1600,
          height: 900,
          alt: 'a mountain',
          focal: null,
        },
      },
    }
    const html = headerHtml(page, ctx)
    expect(html).toContain('cg-entry-header__cover')
    expect(html).toContain('src="/_image?id=cover"')
    expect(html).toContain('alt="a mountain"')
    expect(calls).toBe(0)
  })

  it('escapes a hostile author name and term label', () => {
    const page: PageContent = {
      title: 'My article',
      blocks: PROSE_BLOCKS,
      entry: {
        collection: 'post',
        author: { name: '<script>alert(1)</script>' },
        terms: [{ taxonomy: 'category', label: '"><img onerror=x>', href: null }],
      },
    }
    const html = headerHtml(page, fakeContext())
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img onerror=x>')
  })
})
