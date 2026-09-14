import type { VocabularyBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, CATEGORIES, ENTRIES, makeContext, PRODUCTS } from './fixtures.js'

const ctx = makeContext()
const entries = { 'b-collection': PRODUCTS }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(renderPage({ title: 'Atelier Goods', blocks }, ctx, entries))
}

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

const FULL_PAGE = page(ALL_BLOCKS)

describe('all seventeen blocks', () => {
  it('renders every block of the vocabulary, none returning null', () => {
    for (const block of ALL_BLOCKS) {
      expect(renderBlock(block, ctx, entries), `${block._type} must render`).not.toBeNull()
    }
  })

  it('stamps each rendered block as its own block type, for the stylesheet', () => {
    for (const block of ALL_BLOCKS) {
      expect(FULL_PAGE, block._type).toContain(`data-block="${block._type}"`)
    }
  })

  it('stamps every placed block with the key contract B minted for it', () => {
    for (const block of ALL_BLOCKS) {
      expect(FULL_PAGE).toContain(`data-block-key="${block._key}"`)
    }
  })

  it('puts every block, the hero included, in the one section rhythm', () => {
    const sections = FULL_PAGE.match(/class="ce-section /g) ?? []
    expect(sections.length).toBe(ALL_BLOCKS.length)
  })
})

describe('heading outline', () => {
  it('renders exactly one h1 when a hero carries the page title', () => {
    expect(headingLevels(FULL_PAGE).filter((level) => level === 1)).toHaveLength(1)
  })

  it('renders the page title as the h1 when the page has no hero', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain('<h1 class="ce-page-head__title">Atelier Goods</h1>')
  })

  it('never skips a heading level across the whole page', () => {
    const levels = headingLevels(FULL_PAGE)
    expect(levels.length).toBeGreaterThan(8)
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1] as number
      const current = levels[index] as number
      expect(current, `h${previous} is followed by h${current}`).toBeLessThanOrEqual(previous + 1)
    }
  })

  it('titles every product of an untitled grid at h2, under the page h1', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const html = serialize(renderPage({ title: 'Shop', blocks: [untitled] }, ctx, entries))
    expect(headingLevels(html)).toEqual([1, 2, 2, 2])
  })
})

describe('the page header', () => {
  it('sets the summary of an entry beside its title, and no reading time on an undated page', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Wear',
          blocks: [],
          entry: { collection: 'category', excerpt: 'Jackets and knitwear.', readingMinutes: 1 },
        },
        ctx,
      ),
    )
    expect(html).toContain('<p class="ce-page-head__lead">Jackets and knitwear.</p>')
    expect(html).not.toContain('min read')
    expect(html).not.toContain('ce-page-head__meta')
  })

  it('gives a dated entry its date, author, reading time and cover', () => {
    const html = serialize(
      renderPage(
        {
          title: 'A letter from Manteigas',
          blocks: [],
          entry: {
            collection: 'post',
            publishedAt: '2026-03-02T09:00:00.000Z',
            author: { name: 'Marta Leal' },
            readingMinutes: 4,
            image: ctx.image('media-figure'),
          },
        },
        makeContext({ t: (key, values) => `${key}:${values?.minutes ?? ''}` }),
      ),
    )
    expect(html).toContain('<time datetime="2026-03-02T09:00:00.000Z">March 2, 2026</time>')
    expect(html).toContain('<span>Marta Leal</span>')
    expect(html).toContain('entry.readingTime:4')
    expect(html).toContain('data-cover="true"')
  })

  it('never shows the picture of an undated entry in its own header', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Wear',
          blocks: [],
          entry: { collection: 'category', image: ctx.image('photo-wear') },
        },
        ctx,
      ),
    )
    expect(html).toContain('data-cover="false"')
    expect(html).not.toContain('<img')
  })

  it('falls back to the bare title when there is no entry at all', () => {
    const html = serialize(renderPage({ title: 'Delivery & returns', blocks: [] }, ctx))
    expect(html).toContain('<h1 class="ce-page-head__title">Delivery &amp; returns</h1>')
  })

  it('wraps the page in <main id="cg-main">, the skip link’s fixed target', () => {
    expect(FULL_PAGE).toMatch(/^<main class="cg-main ce-main" id="cg-main">/)
  })
})

describe('images', () => {
  const images = [...FULL_PAGE.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])

  it('renders images, so the rules below are not vacuous', () => {
    expect(images.length).toBeGreaterThan(8)
  })

  it('never renders an image without an alt attribute', () => {
    for (const tag of images) expect(tag, tag).toMatch(/\salt="/)
  })

  it('gives every image intrinsic dimensions, so nothing shifts as it loads', () => {
    for (const tag of images) expect(tag, tag).toMatch(/\swidth="\d+" height="\d+"/)
  })

  it('loads eagerly only the one image a hero opens with', () => {
    expect(FULL_PAGE.match(/loading="eager"/g)).toHaveLength(1)
  })
})

describe('zero client JavaScript', () => {
  it('emits no script tag, no inline handler and no javascript: URL anywhere on a full page', () => {
    expect(FULL_PAGE).not.toMatch(/<script/i)
    expect(FULL_PAGE).not.toMatch(/\son[a-z]+="/i)
    expect(FULL_PAGE).not.toMatch(/javascript:/i)
  })

  it('draws no control the theme cannot back: no cart, no button, no form', () => {
    expect(FULL_PAGE).not.toMatch(/<button|<form|cart/i)
  })
})

describe('links', () => {
  const pages = [
    FULL_PAGE,
    serialize(
      renderPage({ title: 'Categories', blocks: [BLOCKS.collectionList] }, ctx, {
        'b-collection': CATEGORIES,
      }),
    ),
    serialize(
      renderPage({ title: 'Journal', blocks: [BLOCKS.collectionList] }, ctx, {
        'b-collection': ENTRIES,
      }),
    ),
  ]

  it('never renders a link whose only content is an arrow', () => {
    for (const html of pages) {
      for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
        if ((match[1] as string).includes('<img')) continue
        const words = (match[1] as string).replace(/<[^>]+>/g, '').trim()
        expect(words, match[0]).not.toMatch(/^[←-⇿\s]*$/)
      }
    }
  })

  it('writes no arrow glyph into any link text: arrows are drawn by the stylesheet', () => {
    for (const html of pages) expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/[←-⇿]/)
  })
})
