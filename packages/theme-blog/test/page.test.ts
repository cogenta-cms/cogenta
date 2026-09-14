import type { VocabularyBlock } from '@cogenta/blocks'
import type { PageEntryMeta } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { isArticle } from '../src/render/article.js'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, makeContext } from './fixtures.js'

const ctx = makeContext()
const entries = { 'b-collection': ENTRIES }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(renderPage({ title: 'What the second draft is for', blocks }, ctx, entries))
}

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

const FULL_PAGE = page(ALL_BLOCKS)

const ESSAY: PageEntryMeta = {
  collection: 'post',
  publishedAt: '2024-10-20T08:00:00.000Z',
  readingMinutes: 6,
  excerpt: 'A first draft tells you what a piece is about.',
  image: {
    kind: 'image',
    src: '/img/cover.jpg',
    srcset: '',
    width: 1200,
    height: 800,
    alt: 'An open notebook',
    focal: null,
  },
  terms: [
    { taxonomy: 'category', label: 'Writing', href: '/en/category/writing' },
    { taxonomy: 'tag', label: 'Revision', href: '/en/tag/revision' },
    { taxonomy: 'tag', label: 'Drafts', href: null },
  ],
}

function essay(entry: PageEntryMeta = ESSAY, blocks: readonly VocabularyBlock[] = [BLOCKS.prose]) {
  return serialize(renderPage({ title: 'What the second draft is for', blocks, entry }, ctx))
}

describe('renderPage', () => {
  it('wraps content in <main id="cg-main">, the mandatory skip-link target', () => {
    expect(FULL_PAGE).toMatch(/^<main class="cg-main" id="cg-main">/)
  })

  it('renders exactly one h1 when a hero carries the page title', () => {
    expect(headingLevels(FULL_PAGE).filter((level) => level === 1)).toHaveLength(1)
  })

  it('sets the title plainly on the text line when the page has no hero and no essay furniture', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain(
      '<header class="cg-page-head"><div class="cg-container"><h1 class="cg-page__title">What the second draft is for</h1>',
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

  it('wraps every block in the section frame and its twelve-column container', () => {
    for (const block of ALL_BLOCKS) {
      const html = serialize(
        renderBlock(block, ctx, entries) as NonNullable<ReturnType<typeof renderBlock>>,
      )
      expect(html, block._type).toMatch(/^<(section|div) class="cg-section [^"]+" data-block="/)
      expect(html, block._type).toContain('class="cg-container ')
    }
  })

  it('passes the fetched entries through to the collectionList block by key', () => {
    expect(FULL_PAGE).toContain('Why I still write in a plain-text editor')
  })

  it('renders the empty state when no entries were fetched for a key', () => {
    const html = serialize(renderPage({ title: 't', blocks: [BLOCKS.collectionList] }, ctx, {}))
    expect(html).toContain('<p class="cg-collection__empty">collection.empty</p>')
  })
})

describe('renderPage, an essay', () => {
  it('sets the essay header instead of the plain title, with exactly one h1', () => {
    const html = essay()
    expect(html).toMatch(
      /^<main class="cg-main cg-article" id="cg-main"><header class="cg-article-head">/,
    )
    expect(html).toContain('<h1 class="cg-article-head__title">What the second draft is for</h1>')
    expect(html).not.toContain('cg-page__title')
    expect(headingLevels(html).filter((level) => level === 1)).toHaveLength(1)
  })

  it('puts the first term, the long date and the reading time in the margin', () => {
    const html = essay()
    expect(html).toContain(
      '<p class="cg-article-head__topic"><a class="cg-article-head__topic-link" href="/en/category/writing">Writing</a></p>',
    )
    expect(html).toContain(
      '<time class="cg-article-head__date" datetime="2024-10-20T08:00:00.000Z">October 20, 2024</time>',
    )
    expect(html).toContain('<span class="cg-article-head__reading-time">entry.readingTime</span>')
  })

  it('sets the standfirst and the cover at 3:2, loaded eagerly above the fold', () => {
    const html = essay()
    expect(html).toContain(
      '<p class="cg-article-head__standfirst">A first draft tells you what a piece is about.</p>',
    )
    expect(html).toMatch(
      /<figure class="cg-article-head__cover"><img class="cg-article-head__image"[^>]*loading="eager"/,
    )
  })

  it('hides a reading time too short to tell a reader anything', () => {
    const html = essay({ ...ESSAY, readingMinutes: 1 })
    expect(html).not.toContain('cg-article-head__reading-time')
  })

  it('names the author only when the host resolved one', () => {
    expect(essay()).not.toContain('cg-article-head__author')
    expect(essay({ ...ESSAY, author: { name: 'Ruth Calder' } })).toContain(
      '<span class="cg-article-head__author">Ruth Calder</span>',
    )
  })

  it('ends on every term the essay is filed under, a link when it has an archive and text when not', () => {
    const html = essay()
    expect(html).toMatch(/<div class="cg-article-foot">[\s\S]*<\/div><\/main>$/)
    expect(html).toContain(
      '<li class="cg-article-foot__term" data-taxonomy="tag"><a class="cg-article-foot__link" href="/en/tag/revision">Revision</a></li>',
    )
    expect(html).toContain('<span class="cg-article-foot__link">Drafts</span>')
  })

  it('ends on its last paragraph when the essay is filed under nothing', () => {
    const { terms: _terms, ...unfiled } = ESSAY
    expect(essay(unfiled)).not.toContain('cg-article-foot')
  })

  it('keeps the plain title for a page whose entry carries nothing an essay has', () => {
    const html = essay({ collection: 'page', updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(html).toContain('cg-page__title')
    expect(html).not.toContain('cg-article')
  })

  it('lets a hero carry the title even when the page has an entry', () => {
    const html = essay(ESSAY, [BLOCKS.hero])
    expect(html).not.toContain('cg-article-head')
    expect(headingLevels(html).filter((level) => level === 1)).toHaveLength(1)
  })

  it('decides what counts as an essay from the entry alone', () => {
    expect(isArticle(undefined)).toBe(false)
    expect(isArticle({ collection: 'page' })).toBe(false)
    expect(isArticle({ collection: 'post', readingMinutes: 1 })).toBe(false)
    expect(isArticle({ collection: 'post', publishedAt: '2026-01-01T00:00:00.000Z' })).toBe(true)
    expect(isArticle({ collection: 'post', excerpt: 'A standfirst.' })).toBe(true)
  })
})
