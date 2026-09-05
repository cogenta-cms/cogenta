import type { VocabularyBlock } from '@cogenta/blocks'
import type { PageEntryMeta } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, makeContext } from './fixtures.js'

const ctx = makeContext()
const entries = { 'b-collection': ENTRIES }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(
    renderPage(
      { title: 'What ten years of writing daily actually taught me', blocks },
      ctx,
      entries,
    ),
  )
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

  it('renders the page title as the h1 when the page has no hero and no entry', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain(
      '<h1 class="cg-page__title">What ten years of writing daily actually taught me</h1>',
    )
  })

  it("renders renderEntryHeader's furniture instead of the bare title when the page carries an entry", () => {
    const entry: PageEntryMeta = {
      collection: 'post',
      publishedAt: '2026-02-11T09:00:00.000Z',
      author: { name: 'A. Writer' },
      readingMinutes: 4,
      excerpt: 'Ten years of trying every tool that promised to make writing easier.',
      terms: [{ taxonomy: 'category', label: 'Writing', href: '/en/category/writing' }],
    }
    const html = serialize(
      renderPage(
        { title: 'Why I still write in a plain-text editor', blocks: [BLOCKS.prose], entry },
        ctx,
      ),
    )
    expect(html).toContain('cg-entry-header')
    expect(html).toContain('cg-entry-header__terms')
    expect(html).toContain('Writing')
    expect(html).toContain('cg-entry-header__reading-time')
    expect(html).not.toContain('cg-page__title')
    expect(headingLevels(html).filter((level) => level === 1)).toHaveLength(1)
  })

  it('renders a quiet "back to home / more in this topic" strip after a post carrying an entry', () => {
    const entry: PageEntryMeta = {
      collection: 'post',
      terms: [{ taxonomy: 'category', label: 'Writing', href: '/en/category/writing' }],
    }
    const html = serialize(renderPage({ title: 'A post', blocks: [BLOCKS.prose], entry }, ctx))
    expect(html).toContain('cg-post-footer')
    expect(html).toContain('Back to home')
    expect(html).toContain('More in Writing')
  })

  it('renders no post footer for a blocks-only page carrying no entry (e.g. "about")', () => {
    const html = serialize(renderPage({ title: 'About', blocks: [BLOCKS.prose] }, ctx))
    expect(html).not.toContain('cg-post-footer')
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

  it('passes the fetched entries through to the collectionList block by key', () => {
    expect(FULL_PAGE).toContain('Why I still write in a plain-text editor')
  })

  it('renders nothing observably different when no entries were fetched for a key', () => {
    const html = serialize(renderPage({ title: 't', blocks: [BLOCKS.collectionList] }, ctx, {}))
    expect(html).toContain('cg-list__empty')
  })
})
