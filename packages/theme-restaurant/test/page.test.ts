import type { VocabularyBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, DISHES, ENTRIES, makeContext, NOTES } from './fixtures.js'

const ctx = makeContext()
const entries = { 'b-collection': DISHES }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(renderPage({ title: 'Maison Verte', blocks }, ctx, entries))
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

  it('stamps every placed block with the key contract B minted for it, and the same key as its id', () => {
    for (const block of ALL_BLOCKS) {
      expect(FULL_PAGE).toContain(`data-block-key="${block._key}"`)
      expect(FULL_PAGE).toMatch(new RegExp(`\\sid="${block._key}"`))
    }
  })

  it('puts every block, the hero included, in the one section rhythm', () => {
    expect(FULL_PAGE.match(/class="cr-section /g)).toHaveLength(ALL_BLOCKS.length)
  })

  it('renders a list with no fetched entries as its empty state rather than failing', () => {
    const html = serialize(renderPage({ title: 'Menu', blocks: [BLOCKS.collectionList] }, ctx))
    expect(html).toContain('data-shape="empty"')
  })
})

describe('heading outline', () => {
  it('renders exactly one h1 when a hero carries the page title', () => {
    expect(headingLevels(FULL_PAGE).filter((level) => level === 1)).toHaveLength(1)
  })

  it('renders the page title as the h1 when the page has no hero', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain('<h1 class="cr-page-head__title">Maison Verte</h1>')
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

  it('titles the sections of an untitled menu at h2, under the page h1', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const html = serialize(renderPage({ title: 'Menu', blocks: [untitled] }, ctx, entries))
    expect(headingLevels(html)).toEqual([1, 2, 2])
  })
})

describe('the page header', () => {
  it('sets the summary of an entry under its title, and no reading time on an undated page', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Reservations',
          blocks: [],
          entry: { collection: 'page', excerpt: 'How to book a table.', readingMinutes: 1 },
        },
        ctx,
      ),
    )
    expect(html).toContain('<p class="cr-page-head__lead">How to book a table.</p>')
    expect(html).not.toContain('cr-page-head__meta')
  })

  it('gives a dated entry its date, author, reading time and cover', () => {
    const html = serialize(
      renderPage(
        {
          title: 'The first ceps of the year',
          blocks: [],
          entry: {
            collection: 'note',
            publishedAt: '2026-09-08T09:00:00.000Z',
            author: { name: 'Élise Marchand' },
            readingMinutes: 3,
            image: ctx.image('photo-duck'),
          },
        },
        makeContext({ t: (key, values) => `${key}:${values?.minutes ?? ''}` }),
      ),
    )
    expect(html).toContain('<time datetime="2026-09-08T09:00:00.000Z">September 8, 2026</time>')
    expect(html).toContain('<span>Élise Marchand</span>')
    expect(html).toContain('entry.readingTime:3')
    expect(html).toContain('data-cover="true"')
  })

  it('never shows the picture of an undated entry in its own header', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Private dining',
          blocks: [],
          entry: { collection: 'page', image: ctx.image('media-room') },
        },
        ctx,
      ),
    )
    expect(html).toContain('data-cover="false"')
    expect(html).not.toContain('<img')
  })

  it('wraps the page in <main id="cg-main">, the skip link’s fixed target', () => {
    expect(FULL_PAGE).toMatch(/^<main class="cg-main cr-main" id="cg-main">/)
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

describe('zero client JavaScript and honest actions', () => {
  it('emits no script tag, no inline handler and no javascript: URL anywhere on a full page', () => {
    expect(FULL_PAGE).not.toMatch(/<script/i)
    expect(FULL_PAGE).not.toMatch(/\son[a-z]+="/i)
    expect(FULL_PAGE).not.toMatch(/javascript:/i)
  })

  it('draws no control the theme cannot back: no booking form, no button, no cart', () => {
    expect(FULL_PAGE).not.toMatch(/<button|<form|<input|cart/i)
  })
})

describe('links', () => {
  const pages = [
    FULL_PAGE,
    serialize(
      renderPage({ title: 'Notes', blocks: [BLOCKS.collectionList] }, ctx, {
        'b-collection': NOTES,
      }),
    ),
    serialize(
      renderPage({ title: 'News', blocks: [BLOCKS.collectionList] }, ctx, {
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
