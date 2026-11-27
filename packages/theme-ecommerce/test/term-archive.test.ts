import { serialize, type TermArchiveInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const INPUT: TermArchiveInput = {
  taxonomyName: 'materials',
  term: { label: 'Linen', slug: 'linen' },
  ancestors: [{ label: 'Materials', href: '/materials' }],
  children: [{ label: 'Washed linen', href: '/materials/linen/washed' }],
  entries: [
    {
      title: 'Linen table runner',
      href: '/shop/linen-table-runner',
      summary: 'A long runner in washed white linen.',
      collection: 'product',
      publishedAt: null,
    },
    { title: 'Unrouted note', href: null, summary: null, collection: 'note', publishedAt: null },
  ],
  page: { current: 1, totalPages: 2, previousHref: null, nextHref: '/materials/linen?page=2' },
  locale: 'en',
  labels: {
    empty: 'Nothing is filed here yet.',
    previous: 'Previous',
    next: 'Next',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pages',
    subterms: 'Sub-terms',
  },
}

const html = serialize(renderTermArchive(INPUT))

describe('the term archive', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('is the skip link target and carries exactly one h1, the term', () => {
    expect(html).toMatch(/^<main class="cg-main ce-main ce-archive" id="cg-main">/)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('<h1 class="ce-page-head__title">Linen</h1>')
  })

  it('draws the breadcrumb as a labelled ordered list', () => {
    expect(html).toContain('<nav class="ce-archive__breadcrumb" aria-label="Breadcrumb">')
    expect(html).toContain('<a href="/materials">Materials</a>')
  })

  it('lists sub-terms as a ruled line of links', () => {
    expect(html).toContain('aria-label="Sub-terms"')
    expect(html).toContain('href="/materials/linen/washed">Washed linen</a>')
  })

  it('lists entries as an index, linking only the routed ones', () => {
    expect(html).toContain(
      '<a class="ce-index__link" href="/shop/linen-table-runner">Linen table runner</a>',
    )
    expect(html).toContain('<h2 class="ce-index__name">Unrouted note</h2>')
  })

  it('pages with arrow links, and only in the direction there is a page', () => {
    expect(html).toContain(
      '<a class="ce-arrow-link" rel="next" href="/materials/linen?page=2">Next</a>',
    )
    expect(html).not.toContain('rel="prev"')
  })

  it('says so, in the host’s words, when nothing is filed under the term', () => {
    const empty = serialize(
      renderTermArchive({
        ...INPUT,
        entries: [],
        ancestors: [],
        children: [],
        page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
      }),
    )
    expect(empty).toContain('<p class="ce-empty">Nothing is filed here yet.</p>')
    expect(empty).not.toContain('ce-archive__breadcrumb')
    expect(empty).not.toContain('ce-archive__pager')
  })
})

describe('renderTermArchive with showEntries: false', () => {
  const base: TermArchiveInput = INPUT
  const hidden: TermArchiveInput = {
    ...base,
    children: [{ label: 'Only sub-term', href: '/topic/only-sub-term' }],
    entries: [
      {
        title: 'Entry that must not be listed',
        href: '/entry',
        summary: null,
        collection: 'article',
        publishedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    page: { current: 1, totalPages: 2, previousHref: null, nextHref: '/topic/x?page=2' },
    showEntries: false,
  }

  it('draws the sub-term list but neither the entries nor the pager', () => {
    const out = serialize(renderTermArchive(hidden))
    expect(out).toContain('href="/topic/only-sub-term"')
    expect(out).not.toContain('Entry that must not be listed')
    expect(out).not.toContain('aria-label="Pagination"')
  })

  it('does not claim nothing is filed when the page is about sub-terms', () => {
    const out = serialize(renderTermArchive({ ...hidden, entries: [] }))
    expect(out).not.toContain(base.labels.empty)
  })

  it('still lists the entries and the empty message when the field is absent or true', () => {
    expect(serialize(renderTermArchive({ ...hidden, showEntries: true }))).toContain(
      'Entry that must not be listed',
    )
    expect(serialize(renderTermArchive({ ...base, entries: [] }))).toContain(base.labels.empty)
  })
})
