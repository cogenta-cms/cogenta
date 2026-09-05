import type { VocabularyBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, MENU_ENTRIES, makeContext } from './fixtures.js'

const ctx = makeContext()
const entries = { 'b-menu': MENU_ENTRIES }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(renderPage({ title: 'Amaranthe', blocks }, ctx, entries))
}

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

const FULL_PAGE = page(ALL_BLOCKS)

describe('renderPage', () => {
  it('wraps content in <main id="cg-main"> — the mandatory skip-link target', () => {
    expect(FULL_PAGE).toMatch(/^<main class="cg-main" id="cg-main">/)
  })

  it('renders exactly one h1 when a hero carries the page title', () => {
    expect(headingLevels(FULL_PAGE).filter((level) => level === 1)).toHaveLength(1)
  })

  it('renders the page title as the h1 when the page has no hero', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain('<h1 class="cg-page__title">Amaranthe</h1>')
  })

  it('never skips a heading level across the whole page', () => {
    const levels = headingLevels(FULL_PAGE)
    expect(levels.length).toBeGreaterThan(1)
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1] as number
      const current = levels[index] as number
      expect(current, `h${previous} is followed by h${current}`).toBeLessThanOrEqual(previous + 1)
    }
  })

  it('stamps every rendered block with its own data-block-key', () => {
    for (const block of ALL_BLOCKS) {
      expect(FULL_PAGE).toContain(`data-block-key="${block._key}"`)
    }
  })

  it('also stamps every rendered block with a real id, for single-page anchor navigation', () => {
    for (const block of ALL_BLOCKS) {
      expect(FULL_PAGE).toContain(`id="${block._key}"`)
    }
  })

  it('emits no script tag, no inline handler and no javascript: URL', () => {
    expect(FULL_PAGE).not.toMatch(/<script/i)
    expect(FULL_PAGE).not.toMatch(/\son[a-z]+="/i)
    expect(FULL_PAGE).not.toMatch(/javascript:/i)
  })

  it('renders at least one image, and never without an alt attribute', () => {
    const images = [...FULL_PAGE.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
    expect(images.length).toBeGreaterThan(0)
    for (const tag of images) expect(tag).toMatch(/\salt="/)
  })

  it('renders all seventeen blocks in the vocabulary without any returning null', () => {
    for (const block of ALL_BLOCKS) {
      expect(renderBlock(block, ctx, entries), `${block._type} must render`).not.toBeNull()
    }
  })

  it('groups the menu by category and prices every dish', () => {
    expect(FULL_PAGE).toContain('Roasted beet salad')
    expect(FULL_PAGE).toContain('Starters')
    expect(FULL_PAGE).toContain('Mains')
    expect(FULL_PAGE).toMatch(/[€$]\s?9[.,]50|9[.,]50\s?[€$]/)
  })

  it('renders nothing observably different when no entries were fetched for a key', () => {
    const html = serialize(renderPage({ title: 't', blocks: [BLOCKS.collectionList] }, ctx, {}))
    expect(html).toContain('cg-menu__empty')
  })

  it('draws the entry header from page.entry for a routed collection with no blocks of its own', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Roasted beet salad',
          blocks: [],
          entry: { collection: 'menu_item', excerpt: 'Beets, goat cheese, walnuts.' },
        },
        ctx,
        {},
      ),
    )
    expect(html).toContain('cg-entry-header')
    expect(html).toContain('<h1 class="cg-entry-header__title">Roasted beet salad</h1>')
    expect(html).toContain('cg-entry-header__excerpt')
    expect(html).not.toContain('cg-page__title')
  })
})
