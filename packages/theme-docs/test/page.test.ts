import type { VocabularyBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import {
  ALL_BLOCKS,
  BLOCKS,
  DOC_PAGES,
  DOC_SIDEBAR_BLOCK,
  ENTRIES,
  makeContext,
} from './fixtures.js'

const ctx = makeContext()
const entries = { 'b-collection': ENTRIES }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(
    renderPage({ title: 'Everything you need to ship with Cogenta', blocks }, ctx, entries),
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

  it('renders the page title as the h1 when the page has no hero', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain(
      '<h1 class="cg-page__title">Everything you need to ship with Cogenta</h1>',
    )
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
    expect(FULL_PAGE).toContain('What a structured release process actually looks like')
  })

  it('renders nothing observably different when no entries were fetched for a key', () => {
    const html = serialize(renderPage({ title: 't', blocks: [BLOCKS.collectionList] }, ctx, {}))
    expect(html).toContain('cg-list__empty')
  })
})

describe('renderPage — the doc-page two-column layout', () => {
  const docEntries = { [DOC_SIDEBAR_BLOCK._key]: DOC_PAGES }
  // `makeContext`'s own `link()` resolves an entry target to
  // `/en/<collection>/<id>` (it has no routing table to consult) — the
  // fixture's URL has to match exactly what `entryHref` will compute for
  // the "Installation" doc page for the "current page" comparison to have
  // anything to match against.
  const installationCtx = makeContext({
    url: new URL(`https://docs.cogenta.dev/en/doc_page/${DOC_PAGES[0]?.id}`),
  })

  function docPage(blocks: readonly VocabularyBlock[] = [DOC_SIDEBAR_BLOCK]): string {
    return serialize(renderPage({ title: 'Installation', blocks }, installationCtx, docEntries))
  }

  it("is detected from the page's own first block, a collectionList on doc_page", () => {
    const html = docPage()
    expect(html).toContain('class="cg-main cg-docs"')
  })

  it('renders the sidebar in two copies — a live nav for desktop, a <details> "On this site" disclosure for mobile — grouped by section', () => {
    const html = docPage()
    // The outer wrapper carries `data-block-key` like every other block on
    // the page (`withBlockKey`, applied uniformly so the visual page builder
    // can map any rendered element back to its block) — matched on the class
    // alone rather than the full opening tag.
    expect(html).toContain('<div class="cg-docs__nav" data-block-key=')
    // Two copies of the panel, not one shared between breakpoints: a closed
    // `<details>` hides its content through Chrome's own internal
    // `::details-content` box, which a `display: block` override on the
    // content does not reliably defeat while the element stays closed
    // (verified live at 1280px against a real Chrome tab) — so the desktop
    // column is a plain `<div>`, nothing for the browser to collapse, and
    // only the narrow-viewport copy is a real `<details>`.
    expect(html).toContain('<div class="cg-docs__nav-desktop">')
    expect(html).toContain('<details class="cg-docs__nav-mobile">')
    expect(html).toContain('On this site')
    expect((html.match(/aria-label="Documentation"/g) ?? []).length).toBe(2)
    for (const text of ['Getting started', 'Guides', 'Reference']) {
      const heading = `<p class="cg-docs__nav-heading">${text}</p>`
      expect(
        (html.match(new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length,
      ).toBe(2)
    }
  })

  it('highlights the current page in the sidebar with aria-current="page", in both copies', () => {
    const html = docPage()
    expect((html.match(/aria-current="page">Installation<\/a>/g) ?? []).length).toBe(2)
  })

  it('does not highlight any other sidebar entry — exactly one link per copy carries aria-current', () => {
    const html = docPage()
    expect(html.match(/<a class="cg-docs__nav-link"[^>]*aria-current="page"/g)?.length).toBe(2)
  })

  it('renders a breadcrumb naming the current section and title', () => {
    const html = docPage()
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('<li>Getting started</li>')
    expect(html).toContain('<li aria-current="page">Installation</li>')
  })

  it('drops the sidebar collectionList from the ordinary content stream', () => {
    const html = docPage([DOC_SIDEBAR_BLOCK, BLOCKS.prose])
    // The sidebar block's own key is stamped once, on the <details>, never a
    // second time as though it were also a content block.
    expect(html.match(new RegExp(`data-block-key="${DOC_SIDEBAR_BLOCK._key}"`, 'g'))?.length).toBe(
      1,
    )
  })

  it('renders the remaining blocks in the content column, unchanged', () => {
    const html = docPage([DOC_SIDEBAR_BLOCK, BLOCKS.prose])
    expect(html).toContain(`data-block-key="${BLOCKS.prose._key}"`)
    expect(html).toContain('cg-docs__content')
  })

  it('never renders a duplicate h1 on a doc page', () => {
    const html = docPage([DOC_SIDEBAR_BLOCK, BLOCKS.prose])
    expect(headingLevels(html).filter((level) => level === 1)).toHaveLength(1)
  })

  it('does not trigger the doc layout for a collectionList on a different collection', () => {
    const html = serialize(
      renderPage({ title: 'Home', blocks: [BLOCKS.collectionList] }, ctx, entries),
    )
    expect(html).not.toContain('cg-docs')
  })

  it('does not trigger the doc layout when the sidebar collectionList is not first', () => {
    const html = serialize(
      renderPage({ title: 'Home', blocks: [BLOCKS.prose, DOC_SIDEBAR_BLOCK] }, ctx, {
        ...entries,
        [DOC_SIDEBAR_BLOCK._key]: DOC_PAGES,
      }),
    )
    expect(html).not.toContain('cg-docs__nav')
  })
})
