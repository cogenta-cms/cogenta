import type { VocabularyBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, EVENTS, makeContext, PROGRAMMES } from './fixtures.js'

const ctx = makeContext({ url: new URL('https://commonground.example/en/') })
const entries = { 'b-collection': EVENTS }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(renderPage({ title: 'Common Ground', blocks }, ctx, entries))
}

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

const FULL_PAGE = page(ALL_BLOCKS)

describe('all seventeen blocks', () => {
  it('renders every block of the vocabulary, none returning null', () => {
    expect(ALL_BLOCKS).toHaveLength(17)
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
    expect(FULL_PAGE.match(/class="ca-section /g)).toHaveLength(ALL_BLOCKS.length)
  })

  it('renders a list with no fetched entries as its empty state rather than failing', () => {
    const html = serialize(renderPage({ title: 'Events', blocks: [BLOCKS.collectionList] }, ctx))
    expect(html).toContain('data-shape="empty"')
  })
})

describe('heading outline', () => {
  it('renders exactly one h1 when a hero carries the page title', () => {
    expect(headingLevels(FULL_PAGE).filter((level) => level === 1)).toHaveLength(1)
    expect(FULL_PAGE).toContain('data-opening="hero"')
  })

  it('renders the page title as the h1 when the page has no hero', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain('<h1 class="ca-page-head__title">Common Ground</h1>')
  })

  it('never skips a heading level across the whole page', () => {
    const levels = headingLevels(FULL_PAGE)
    expect(levels.length).toBeGreaterThan(10)
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1] as number
      const current = levels[index] as number
      expect(current, `h${previous} is followed by h${current}`).toBeLessThanOrEqual(previous + 1)
    }
  })

  it('wraps the page in <main id="cg-main">, the skip link’s fixed target', () => {
    expect(FULL_PAGE).toMatch(/^<main class="cg-main ca-main" id="cg-main"/)
  })
})

describe('images', () => {
  const images = [...FULL_PAGE.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])

  it('renders images, so the rules below are not vacuous', () => {
    expect(images.length).toBeGreaterThan(8)
  })

  it('never renders an image without an alt attribute', () => {
    for (const tag of images) expect(tag).toMatch(/\salt="/)
  })

  it('gives every image intrinsic dimensions, so nothing shifts as it loads', () => {
    for (const tag of images) expect(tag).toMatch(/\swidth="\d+" height="\d+"/)
  })

  it('loads eagerly only the one photograph a hero opens with', () => {
    expect(images.filter((tag) => tag.includes('loading="eager"'))).toHaveLength(1)
  })

  it('adds no inline style to an image beyond its focal point', () => {
    for (const tag of images) {
      const style = tag.match(/style="([^"]*)"/)?.[1]
      if (style !== undefined) expect(style).toMatch(/^object-position:[\d.]+% [\d.]+%$/)
    }
  })
})

describe('zero client JavaScript and honest actions', () => {
  it('emits no script tag, no inline handler and no javascript: URL anywhere on a full page', () => {
    expect(FULL_PAGE).not.toMatch(/<script/i)
    expect(FULL_PAGE).not.toMatch(/\son[a-z]+="/i)
    expect(FULL_PAGE).not.toMatch(/javascript:/i)
  })

  it('draws no control the theme cannot back: no form, no field, no button, no payment', () => {
    expect(FULL_PAGE).not.toMatch(/<button|<form|<input|<select|checkout|card number|pay now/i)
  })

  it('writes no inline style other than a crop ratio, a bar length or a focal point', () => {
    for (const match of FULL_PAGE.matchAll(/style="([^"]*)"/g)) {
      expect(match[1]).toMatch(/^(aspect-ratio:[\d ./]+|inline-size:[\d.]+%|object-position:.*)$/)
    }
  })
})

describe('links', () => {
  const pages = [
    FULL_PAGE,
    serialize(
      renderPage({ title: 'What we do', blocks: [BLOCKS.collectionList] }, ctx, {
        'b-collection': PROGRAMMES,
      }),
    ),
    serialize(
      renderPage({ title: 'Reports', blocks: [BLOCKS.collectionList] }, ctx, {
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

  it('wraps the last word of every arrow link in the span that carries its arrow', () => {
    for (const html of pages) {
      for (const match of html.matchAll(/<a class="ca-arrow-link[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
        expect(match[1]).toMatch(/<span class="ca-arrow-link__(end|start)">[^<\s]+<\/span>$/)
      }
    }
  })
})
