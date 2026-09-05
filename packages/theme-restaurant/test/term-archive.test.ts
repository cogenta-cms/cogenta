import type { TermArchiveInput } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const INPUT: TermArchiveInput = {
  taxonomyName: 'category',
  term: { label: 'Mains', slug: 'mains' },
  ancestors: [],
  children: [],
  entries: [
    {
      title: 'Pan-seared trout',
      href: '/menu/pan-seared-trout',
      summary: 'Local trout, brown butter, seasonal vegetables.',
      collection: 'menu_item',
      publishedAt: '2026-02-11T09:00:00.000Z',
    },
  ],
  page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
  locale: 'en',
  labels: {
    empty: 'Nothing to show yet.',
    previous: 'Previous',
    next: 'Next',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pagination',
    subterms: 'Sub-categories',
  },
}

describe('renderTermArchive', () => {
  it('renders the term label as the page h1', () => {
    const html = serialize(renderTermArchive(INPUT))
    expect(html).toContain('<h1 class="cg-index__title-heading">Mains</h1>')
  })

  it('renders every entry as a linked row with its date and summary', () => {
    const html = serialize(renderTermArchive(INPUT))
    expect(html).toContain('Pan-seared trout')
    expect(html).toContain('Local trout, brown butter, seasonal vegetables.')
    expect(html).toContain('datetime="2026-02-11T09:00:00.000Z"')
  })

  it('renders the translated empty state when there are no entries', () => {
    const html = serialize(renderTermArchive({ ...INPUT, entries: [] }))
    expect(html).toContain('Nothing to show yet.')
  })

  it('renders no pager when there is only one page', () => {
    const html = serialize(renderTermArchive(INPUT))
    expect(html).not.toContain('cg-archive__pager')
  })

  it('renders a pager when a next page exists', () => {
    const html = serialize(
      renderTermArchive({ ...INPUT, page: { ...INPUT.page, nextHref: '/category/mains/2' } }),
    )
    expect(html).toContain('cg-archive__pager')
    expect(html).toContain('rel="next"')
  })
})
