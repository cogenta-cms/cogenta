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
  return serialize(renderPage({ title: 'Relay documentation', blocks }, ctx, entries))
}

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

const FULL_PAGE = page(ALL_BLOCKS)

describe('renderPage, any page', () => {
  it('wraps content in <main id="cg-main">, the skip link’s target', () => {
    expect(FULL_PAGE).toMatch(/^<main class="cg-main cd-main" id="cg-main">/)
  })

  it('renders exactly one h1 when a hero carries the title', () => {
    expect(headingLevels(FULL_PAGE).filter((level) => level === 1)).toHaveLength(1)
  })

  it('opens a page without a hero on its title, summary and date', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Security',
          blocks: [BLOCKS.prose],
          entry: {
            collection: 'page',
            excerpt: 'How keys are stored.',
            publishedAt: '2026-09-02T09:00:00.000Z',
          },
        },
        ctx,
      ),
    )
    expect(html).toContain('<h1 class="cd-page-head__title">Security</h1>')
    expect(html).toContain('<p class="cd-page-head__lead">How keys are stored.</p>')
    expect(html).toContain('September 2, 2026')
    expect(headingLevels(html).filter((level) => level === 1)).toHaveLength(1)
  })

  it('never skips a heading level across the whole page', () => {
    const levels = headingLevels(FULL_PAGE)
    expect(levels.length).toBeGreaterThan(5)
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index] as number).toBeLessThanOrEqual((levels[index - 1] as number) + 1)
    }
  })

  it('stamps every rendered block with its own data-block-key', () => {
    for (const block of ALL_BLOCKS) expect(FULL_PAGE).toContain(`data-block-key="${block._key}"`)
  })

  it('emits no script, no inline handler and no javascript: URL', () => {
    expect(FULL_PAGE).not.toMatch(/<script/i)
    expect(FULL_PAGE).not.toMatch(/\son[a-z]+="/i)
    expect(FULL_PAGE).not.toMatch(/javascript:/i)
  })

  it('never renders an image without an alt attribute', () => {
    const images = [...FULL_PAGE.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
    expect(images.length).toBeGreaterThan(5)
    for (const tag of images) expect(tag).toMatch(/\salt="/)
  })

  it('renders all seventeen blocks without any returning null', () => {
    expect(ALL_BLOCKS).toHaveLength(17)
    for (const block of ALL_BLOCKS)
      expect(renderBlock(block, ctx, entries), block._type).not.toBeNull()
  })

  it('gives every id on the page exactly one owner', () => {
    const ids = [...FULL_PAGE.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('passes the fetched entries to the collectionList block by key', () => {
    expect(FULL_PAGE).toContain('What a structured release process actually looks like')
  })
})

describe('renderPage, a documentation page', () => {
  const docEntries = { [DOC_SIDEBAR_BLOCK._key]: DOC_PAGES }
  // The fixture context links an entry to `/en/<collection>/<id>`: the page
  // being rendered is Configuration, second in reading order.
  const configuration = DOC_PAGES[0]
  const docCtx = makeContext({
    url: new URL(`https://docs.relay.dev/en/doc_page/${configuration?.id}`),
  })

  function docPage(
    blocks: readonly VocabularyBlock[] = [DOC_SIDEBAR_BLOCK, BLOCKS.prose],
    updatedAt?: string,
  ): string {
    return serialize(
      renderPage(
        {
          title: 'Configuration',
          blocks,
          entry: {
            collection: 'doc_page',
            excerpt: 'Where the server reads its settings.',
            ...(updatedAt === undefined ? {} : { updatedAt }),
          },
        },
        docCtx,
        docEntries,
      ),
    )
  }

  const html = docPage([DOC_SIDEBAR_BLOCK, BLOCKS.prose], '2026-09-02T10:00:00.000Z')

  it('is recognised from its first block, a collectionList on doc_page', () => {
    expect(html).toMatch(/^<main class="cg-main cd-doc" id="cg-main" data-toc="true">/)
  })

  it('renders the navigation twice: a plain nav for wide screens, a disclosure for narrow ones', () => {
    expect(html).toContain('<nav class="cd-sidenav cd-sidenav--wide" aria-label="Documentation">')
    expect(html).toContain('<details class="cd-sidenav-disclosure">')
    expect(html).toContain('<nav class="cd-sidenav cd-sidenav--narrow" aria-label="Documentation">')
  })

  it('names where the reader is in the disclosure’s summary', () => {
    expect(html).toContain(
      '<span class="cd-sidenav-disclosure__where">Getting started / Configuration</span>',
    )
  })

  it('groups the navigation by section, in the documentation’s order', () => {
    const at = (text: string): number => html.indexOf(`<p class="cd-sidenav__heading">${text}</p>`)
    expect(at('Getting started')).toBeGreaterThan(-1)
    expect(at('Getting started')).toBeLessThan(at('Guides'))
    expect(at('Guides')).toBeLessThan(at('Reference'))
    expect(html.indexOf('>Installation</a>')).toBeLessThan(html.indexOf('>Configuration</a>'))
  })

  it('marks the current page, once in each copy and nowhere else', () => {
    expect(html.match(/aria-current="page">Configuration<\/a>/g)).toHaveLength(2)
    expect(html.match(/<a class="cd-sidenav__link"[^>]*aria-current="page"/g)).toHaveLength(2)
  })

  it('stamps the navigation with its block key once, and never renders it as content', () => {
    expect(html.match(new RegExp(`data-block-key="${DOC_SIDEBAR_BLOCK._key}"`, 'g'))).toHaveLength(
      1,
    )
    expect(html).not.toContain('cd-browse')
  })

  it('opens the article on a breadcrumb, the title and the summary', () => {
    expect(html).toContain(
      '<nav class="cd-breadcrumb" aria-label="Breadcrumb"><ol class="cd-breadcrumb__items"><li><a href="/en/">Docs</a></li><li>Getting started</li><li aria-current="page">Configuration</li></ol></nav>',
    )
    expect(html).toContain('<h1 class="cd-doc__title">Configuration</h1>')
    expect(html).toContain('<p class="cd-doc__lede">Where the server reads its settings.</p>')
    expect(headingLevels(html).filter((level) => level === 1)).toHaveLength(1)
  })

  it('lists the article’s own headings under "On this page", every link resolving to an id', () => {
    expect(html).toContain('<nav class="cd-toc" aria-labelledby="cd-toc-label">')
    const links = [...html.matchAll(/class="cd-toc__link" href="#([^"]+)"/g)].map(
      (match) => match[1],
    )
    expect(links).toEqual(['what-gets-installed', 'options'])
    for (const id of links) expect(html).toContain(`id="${id}"`)
  })

  it('nests an h3 under the h2 before it', () => {
    expect(html).toMatch(
      /data-level="2"><a class="cd-toc__link" href="#what-gets-installed">What gets installed<\/a><ol class="cd-toc__items"><li class="cd-toc__item" data-level="3">/,
    )
  })

  it('leaves out "On this page" when the article has fewer than two headings', () => {
    const short = docPage([DOC_SIDEBAR_BLOCK, BLOCKS.cta])
    expect(short).not.toContain('cd-toc')
    expect(short).toContain('data-toc="false"')
  })

  it('links the previous and next pages in reading order', () => {
    expect(html).toMatch(
      /<a class="cd-pager__link" data-direction="previous" href="\/en\/doc_page\/[^"]+10" rel="prev"><span class="cd-pager__label">Previous<\/span><span class="cd-pager__title">Installation<\/span><\/a>/,
    )
    expect(html).toMatch(
      /data-direction="next"[^>]*rel="next"><span class="cd-pager__label">Next<\/span><span class="cd-pager__title">Deploying to production<\/span>/,
    )
  })

  it('offers no previous link on the first page and no next link on the last', () => {
    const lastCtx = makeContext({
      url: new URL(`https://docs.relay.dev/en/doc_page/${DOC_PAGES[1]?.id}`),
    })
    const last = serialize(
      renderPage({ title: 'CLI reference', blocks: [DOC_SIDEBAR_BLOCK] }, lastCtx, docEntries),
    )
    expect(last).toContain('data-direction="previous"')
    expect(last).not.toContain('data-direction="next"')
  })

  it('says when the page last changed, in a readable date', () => {
    expect(html).toContain(
      '<p class="cd-doc__updated">Last updated <time datetime="2026-09-02T10:00:00.000Z">September 2, 2026</time></p>',
    )
  })

  it('offers no comment form and no feedback widget', () => {
    expect(html).not.toMatch(/<form|helpful|cg-comment/i)
  })

  it('does not become a documentation page for a list of another collection, or when the index is not first', () => {
    expect(
      serialize(renderPage({ title: 'Home', blocks: [BLOCKS.collectionList] }, ctx, entries)),
    ).not.toContain('cd-doc')
    const later = serialize(
      renderPage({ title: 'Home', blocks: [BLOCKS.prose, DOC_SIDEBAR_BLOCK] }, ctx, docEntries),
    )
    expect(later).not.toContain('cd-sidenav')
    expect(later).toContain('cd-browse')
  })
})
