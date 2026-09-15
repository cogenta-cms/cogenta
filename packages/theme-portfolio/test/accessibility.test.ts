import type { VocabularyBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../src/render/blocks/embed.js'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, GRID_ENTRIES, makeContext } from './fixtures.js'

const ctx = makeContext()
const entries = { 'b-collection': ENTRIES }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(renderPage({ title: 'Studio', blocks }, ctx, entries))
}

function block(value: VocabularyBlock): string {
  const node = renderBlock(value, ctx, entries)
  expect(node, `${value._type} must render`).not.toBeNull()
  return node === null ? '' : serialize(node)
}

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

const FULL_PAGE = page(ALL_BLOCKS)

describe('heading outline', () => {
  it('renders exactly one h1 when a hero carries the page title', () => {
    expect(headingLevels(FULL_PAGE).filter((level) => level === 1)).toHaveLength(1)
  })

  it('renders the page title as the h1 when the page has no hero', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain('<h1 class="cg-page-head__title">Studio</h1>')
  })

  it('never skips a heading level', () => {
    const levels = headingLevels(FULL_PAGE)
    expect(levels.length).toBeGreaterThan(1)
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1] as number
      const current = levels[index] as number
      expect(current, `h${previous} is followed by h${current}`).toBeLessThanOrEqual(previous + 1)
    }
  })

  it('starts rich text headings at h2, never at h1', () => {
    const prose = block(BLOCKS.prose)
    expect(prose).toContain('<h2 id="')
    expect(prose).not.toContain('<h1')
  })

  it('keeps a titleless block and its items on consecutive levels', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    expect(headingLevels(block(untitled))).toEqual([2, 2])
  })

  it('titles every piece of work in an untitled grid at h2, under the page h1', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const html = serialize(
      renderPage({ title: 'Work', blocks: [untitled] }, ctx, { 'b-collection': GRID_ENTRIES }),
    )
    expect(headingLevels(html)[0]).toBe(1)
    expect(
      headingLevels(html)
        .slice(1)
        .every((level) => level === 2),
    ).toBe(true)
  })

  it('gives a list of names no headings at all: a name is an item, not a section', () => {
    const names = {
      ...BLOCKS.featureGrid,
      items: [
        { _key: 'n1', title: 'Rookery Hall' },
        { _key: 'n2', title: 'Tidewater Trust' },
      ],
    }
    expect(headingLevels(block(names))).toEqual([2])
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

  it('names a mark with its organisation when the media entity has no alt text', () => {
    expect(block(BLOCKS.logos)).toContain('alt="Acme Concert Hall"')
  })

  it('keeps an empty alt on a decorative portrait rather than inventing one', () => {
    expect(block(BLOCKS.quote)).toMatch(/<img[^>]*class="cg-quote__avatar"[^>]*alt=""/)
  })

  it('gives every image intrinsic dimensions, so nothing shifts as it loads', () => {
    for (const tag of images) expect(tag, tag).toMatch(/\swidth="\d+" height="\d+"/)
  })

  it('hides the duplicate image link of a piece of work from assistive technology and the tab order', () => {
    const html = block(BLOCKS.collectionList)
    for (const link of html.match(/<a class="cg-work__media"[^>]*>/g) ?? []) {
      expect(link).toContain('tabindex="-1"')
      expect(link).toContain('aria-hidden="true"')
    }
  })
})

describe('zero client JavaScript', () => {
  it('emits no script tag, no inline handler and no javascript: URL', () => {
    expect(FULL_PAGE).not.toMatch(/<script/i)
    expect(FULL_PAGE).not.toMatch(/\son[a-z]+="/i)
    expect(FULL_PAGE).not.toMatch(/javascript:/i)
  })

  it('renders a scrolling gallery as a focusable, labelled region', () => {
    const html = block({ ...BLOCKS.gallery, layout: 'carousel' })
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="gallery.carousel"')
    expect(html).toContain('tabindex="0"')
  })

  it('renders collapsible notes with details and summary rather than a scripted accordion', () => {
    const html = block(BLOCKS.accordion)
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
  })
})

describe('links', () => {
  it('never renders a link whose only content is an arrow', () => {
    for (const match of FULL_PAGE.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
      if ((match[1] as string).includes('<img')) continue
      const words = (match[1] as string).replace(/<[^>]+>/g, '').trim()
      expect(words, match[0]).not.toMatch(/^[←-⇿\s]*$/)
    }
  })

  it('writes no arrow glyph into any link text: arrows are drawn by the stylesheet', () => {
    expect(FULL_PAGE.replace(/<[^>]+>/g, '')).not.toMatch(/[←-⇿]/)
  })

  it('protects a link that leaves the site, and not one that stays', () => {
    const hero = block(BLOCKS.hero)
    expect(hero).toMatch(/href="https:\/\/example\.org\/work" rel="noopener noreferrer"/)
    expect(hero).not.toMatch(/href="\/en\/contact" rel=/)
  })
})

describe('embed consent', () => {
  it('contacts no third party when consent is required', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('player.vimeo.com')
  })

  it('gives every frame an accessible name', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toMatch(/<iframe[^>]*\stitle="/)
  })
})
