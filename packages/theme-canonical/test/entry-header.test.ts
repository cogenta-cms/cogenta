import { describe, expect, it } from 'vitest'
import { serialize } from '../src/render/html.js'
import { renderPage } from '../src/render/render-block.js'
import { BLOCKS, makeContext } from './fixtures.js'

/**
 * `theme@1.4` (L25 D2) — `PageContent.entry` and `renderEntryHeader`
 * (`@cogenta/theme-kit`), wired into `renderPage` (`render-block.ts`). The
 * property this file exists to prove: a page renders exactly one `<h1>`,
 * whether that comes from a `hero` block, from `renderEntryHeader`, or from
 * the bare `.cg-page__title` fallback — never zero, never two.
 */

const ctx = makeContext()

function h1Count(html: string): number {
  return (html.match(/<h1[ >]/g) ?? []).length
}

describe('renderPage — entry header (theme@1.4)', () => {
  it('renders the bare page title, unchanged, when no entry meta is given', () => {
    const html = serialize(renderPage({ title: 'A page', blocks: [BLOCKS.prose] }, ctx, {}))
    expect(html).toContain('<h1 class="cg-page__title">A page</h1>')
    expect(html).not.toContain('cg-entry-header')
    expect(h1Count(html)).toBe(1)
  })

  it('renders the entry header instead of the bare title when entry meta is present and no hero exists', () => {
    const html = serialize(
      renderPage(
        { title: 'My article', blocks: [BLOCKS.prose], entry: { collection: 'post' } },
        ctx,
        {},
      ),
    )
    expect(html).toContain('<header class="cg-entry-header">')
    expect(html).toContain('<h1 class="cg-entry-header__title">My article</h1>')
    expect(html).not.toContain('cg-page__title')
    expect(h1Count(html)).toBe(1)
  })

  it('lets the hero draw the only h1 when both a hero block and entry meta are present', () => {
    const html = serialize(
      renderPage(
        { title: 'My article', blocks: [BLOCKS.hero, BLOCKS.cta], entry: { collection: 'post' } },
        ctx,
        {},
      ),
    )
    expect(html).not.toContain('cg-entry-header')
    expect(html).not.toContain('cg-page__title')
    expect(h1Count(html)).toBe(1)
  })

  it('renders the full entry header — terms, excerpt, meta, cover — when the entry carries them', () => {
    const html = serialize(
      renderPage(
        {
          title: 'My article',
          blocks: [BLOCKS.prose],
          entry: {
            collection: 'post',
            publishedAt: '2026-02-01T00:00:00.000Z',
            excerpt: 'A short summary.',
            author: { name: 'Ada Lovelace' },
            readingMinutes: 3,
            terms: [{ taxonomy: 'category', label: 'News', href: '/category/news' }],
            image: {
              kind: 'image',
              src: '/img/cover-1600.avif',
              srcset: '',
              width: 1600,
              height: 900,
              alt: 'A cover photo',
              focal: null,
            },
          },
        },
        ctx,
        {},
      ),
    )
    expect(html).toContain('cg-entry-header__terms')
    expect(html).toContain('News')
    expect(html).toContain('cg-entry-header__excerpt')
    expect(html).toContain('A short summary.')
    expect(html).toContain('cg-entry-header__meta')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('cg-entry-header__cover')
    expect(html).toContain('/img/cover-1600.avif')
    expect(h1Count(html)).toBe(1)
  })
})
