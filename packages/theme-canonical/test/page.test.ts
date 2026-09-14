import type { VocabularyBlock } from '@cogenta/blocks'
import { createThemeTranslator, type TermArchiveInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../src/render/blocks/collection-list.js'
import { renderPricingTable } from '../src/render/blocks/pricing-table.js'
import { serialize } from '../src/render/html.js'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { renderTermArchive } from '../src/render/term-archive.js'
import type { ContentEntry } from '../src/theme-contract.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, makeContext } from './fixtures.js'

/**
 * The page as a reader, and the page builder (L16), meet it: what the
 * redesign of L27 decided in markup — not in the stylesheet — held in place.
 */

const ctx = makeContext()
const entries = { 'b-collection': ENTRIES }

function html(block: VocabularyBlock): string {
  const node = renderBlock(block, ctx, entries)
  expect(node, `${block._type} must render`).not.toBeNull()
  return node === null ? '' : serialize(node)
}

describe('the hooks the page builder relies on', () => {
  const page = serialize(renderPage({ title: 'All blocks', blocks: ALL_BLOCKS }, ctx, entries))

  it('renders all seventeen blocks of the vocabulary', () => {
    expect(ALL_BLOCKS).toHaveLength(17)
  })

  it('puts the block type and its contract-B key on the outermost element of every block', () => {
    for (const block of ALL_BLOCKS) {
      const opening = new RegExp(
        `<(section|div|figure)\\s[^>]*data-block="${block._type}"[^>]*data-block-key="${block._key}"`,
      )
      expect(page, block._type).toMatch(opening)
      const markup = html(block)
      expect(markup.slice(0, markup.indexOf('>')), block._type).toContain(
        `data-block="${block._type}"`,
      )
    }
  })

  it('gives every block the one page frame class, so the builder and the stylesheet see the same boxes', () => {
    expect(page.match(/class="cg-block /g)).toHaveLength(ALL_BLOCKS.length)
  })

  it('names the plain text fields an editor can type into, and only those', () => {
    expect(html(BLOCKS.hero)).toContain('data-field="eyebrow"')
    expect(html(BLOCKS.hero)).toContain('data-field="title"')
    expect(html(BLOCKS.cta)).toContain('data-field="text"')
    expect(html(BLOCKS.quote)).toContain('data-field="author"')
    expect(html(BLOCKS.mediaFigure)).toContain('data-field="credit"')
    expect(html(BLOCKS.logoStrip)).toContain('data-field="caption"')
    expect(html(BLOCKS.testimonial)).not.toContain('data-field=')
  })
})

describe('the hero', () => {
  it('tells the stylesheet whether it has a photograph', () => {
    expect(html(BLOCKS.hero)).toContain('data-media="true"')
    const { media: _media, ...wordsOnly } = BLOCKS.hero
    expect(html(wordsOnly)).toContain('data-media="false"')
    expect(html(wordsOnly)).not.toContain('cg-hero__media')
  })

  it('loads its photograph eagerly, the one image above the fold', () => {
    expect(html(BLOCKS.hero)).toMatch(/<img class="cg-hero__image"[^>]*loading="eager"/)
  })
})

describe('lists of entries', () => {
  const pictured = (id: string, cover: string | undefined): ContentEntry => ({
    id,
    collection: 'article',
    locale: 'en',
    status: 'published',
    title: `Entry ${id}`,
    publishedAt: '2026-03-04T09:00:00.000Z',
    ...(cover === undefined ? {} : { coverImage: cover }),
  })

  function list(layout: 'list' | 'grid' | 'carousel', items: readonly ContentEntry[]): string {
    return serialize(renderCollectionList({ ...BLOCKS.collectionList, layout }, ctx, items))
  }

  it('opens every entry of a grid on its picture when every entry has one', () => {
    const markup = list('grid', [pictured('a', 'media-hero'), pictured('b', 'media-figure')])
    expect(markup.match(/class="cg-entry__image"/g)).toHaveLength(2)
    expect(markup).not.toContain('data-picture="false"')
  })

  it('sets a grid in type alone as soon as one entry has no picture, never a row with a hole', () => {
    const markup = list('grid', [pictured('a', 'media-hero'), pictured('b', undefined)])
    expect(markup).not.toContain('cg-entry__image')
    expect(markup.match(/data-picture="false"/g)).toHaveLength(2)
  })

  it('never shows pictures in an index', () => {
    const markup = list('list', [pictured('a', 'media-hero'), pictured('b', 'media-figure')])
    expect(markup).not.toContain('<img')
  })

  it('keeps the picture out of the tab order and the accessibility tree: the title is the one named link', () => {
    const markup = list('carousel', [pictured('a', 'media-hero')])
    expect(markup).toMatch(/<a class="cg-entry__media"[^>]*tabindex="-1"[^>]*aria-hidden="true"/)
    expect(markup).toMatch(/<img class="cg-entry__image"[^>]*alt=""/)
  })

  it('writes dates as long dates in the page’s language, the machine form kept in datetime', () => {
    const markup = list('list', ENTRIES)
    expect(markup).toContain(
      '<time class="cg-entry__date" datetime="2026-02-11T09:00:00.000Z">February 11, 2026</time>',
    )
    const french = serialize(
      renderCollectionList(BLOCKS.collectionList, makeContext({ locale: 'fr' }), ENTRIES),
    )
    expect(french).toContain('11 février 2026')
  })

  it('offers no scrollable region for an empty carousel, only the sentence that says it is empty', () => {
    const markup = list('carousel', [])
    expect(markup).not.toContain('role="region"')
    expect(markup).toContain('cg-collection__empty')
  })
})

describe('the pricing table', () => {
  const tiers = BLOCKS.pricingTable.tiers

  it('says “Recommended” in words on the highlighted plan, in the page’s language', () => {
    const highlighted = {
      ...BLOCKS.pricingTable,
      tiers: tiers.map((tier, index) => ({ ...tier, highlighted: index === 0 })),
    }
    expect(serialize(renderPricingTable(highlighted, ctx))).toContain(
      '<p class="cg-pricing__flag">Recommended</p>',
    )
    expect(serialize(renderPricingTable(highlighted, makeContext({ locale: 'fr' })))).toContain(
      'Recommandé',
    )
  })

  it('gives the recommended plan the filled button and the others an outline, unless the editor chose', () => {
    const block = {
      ...BLOCKS.pricingTable,
      tiers: [
        {
          ...tiers[0],
          _key: 't1',
          name: 'One',
          price: '1',
          features: [],
          highlighted: true,
          action: { label: 'A', target: { href: '/a' } },
        },
        {
          ...tiers[0],
          _key: 't2',
          name: 'Two',
          price: '2',
          features: [],
          highlighted: false,
          action: { label: 'B', target: { href: '/b' } },
        },
        {
          ...tiers[0],
          _key: 't3',
          name: 'Three',
          price: '3',
          features: [],
          action: { label: 'C', target: { href: '/c' }, emphasis: 'primary' as const },
        },
      ],
    } as typeof BLOCKS.pricingTable
    const markup = serialize(renderPricingTable(block, ctx))
    expect(markup).toContain('data-emphasis="primary" href="/en/a"')
    expect(markup).toContain('data-emphasis="secondary" href="/en/b"')
    expect(markup).toContain('data-emphasis="primary" href="/en/c"')
  })
})

describe('the consent placeholder of an embed', () => {
  it('links out with an arrow that travels with the last word of its label', () => {
    const markup = serialize(
      renderBlock(BLOCKS.embed, makeContext({ t: createThemeTranslator('en') })) ?? {
        kind: 'text',
        value: '',
      },
    )
    expect(markup).toContain(
      '<a class="cg-arrow-link cg-embed__link" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" rel="noopener noreferrer nofollow">Open on <span class="cg-arrow-link__end">YouTube</span></a>',
    )
  })
})

describe('the term archive', () => {
  const input: TermArchiveInput = {
    taxonomyName: 'category',
    term: { label: 'Archives', slug: 'archives' },
    ancestors: [{ label: 'Subjects', href: '/category/subjects' }],
    children: [{ label: 'Maps', href: '/category/maps' }],
    entries: [
      {
        title: 'The river archive',
        href: '/blog/river',
        summary: 'A century of tide tables.',
        collection: 'post',
        publishedAt: '2026-09-02T08:00:00.000Z',
      },
      { title: 'Unrouted note', href: null, summary: null, collection: 'note', publishedAt: null },
    ],
    page: {
      current: 2,
      totalPages: 3,
      previousHref: '/category/archives',
      nextHref: '/category/archives?page=3',
    },
    locale: 'en',
    labels: {
      empty: 'Nothing is filed here yet.',
      previous: 'Previous page',
      next: 'Next page',
      breadcrumb: 'Breadcrumb',
      pagination: 'Pages',
      subterms: 'Sub-categories',
    },
  }
  const markup = serialize(renderTermArchive(input))

  it('keeps the skip link’s target and the one page title every host page shares', () => {
    expect(markup.startsWith('<main class="cg-main cg-archive" id="cg-main">')).toBe(true)
    expect(markup.match(/<h1 /g)).toHaveLength(1)
    expect(markup).toContain('<h1 class="cg-page__title">Archives</h1>')
  })

  it('lists entries with the collection list’s own index markup, dates in the same long form', () => {
    expect(markup).toContain('<section class="cg-collection cg-archive__list" data-layout="list">')
    expect(markup).toContain('>September 2, 2026</time>')
    expect(markup).not.toContain('2026-09-02</time>')
  })

  it('lists an unroutable entry as text, never as a dead link', () => {
    expect(markup).toContain('<h2 class="cg-entry__title">Unrouted note</h2>')
  })

  it('pages with arrow links whose arrows travel with a word', () => {
    expect(markup).toContain(
      '<a class="cg-arrow-link" rel="prev" href="/category/archives"><span class="cg-arrow-link__start">Previous</span> page</a>',
    )
    expect(markup).toContain(
      '<a class="cg-arrow-link" rel="next" href="/category/archives?page=3">Next <span class="cg-arrow-link__end">page</span></a>',
    )
  })

  it('says so in a sentence when the term classifies nothing, and draws no pager for a single page', () => {
    const empty = serialize(
      renderTermArchive({
        ...input,
        entries: [],
        page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
      }),
    )
    expect(empty).toContain('<p class="cg-collection__empty">Nothing is filed here yet.</p>')
    expect(empty).not.toContain('cg-archive__pager')
  })
})
