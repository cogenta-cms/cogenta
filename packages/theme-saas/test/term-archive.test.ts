import { serialize, type TermArchiveInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const LABELS = {
  empty: 'Nothing is filed here yet.',
  previous: 'Newer',
  next: 'Older',
  breadcrumb: 'Breadcrumb',
  pagination: 'Pages',
  subterms: 'Sub-areas',
}

const INPUT: TermArchiveInput = {
  taxonomyName: 'area',
  term: { label: 'Policies', slug: 'policies' },
  ancestors: [{ label: 'Product', href: '/area/product' }],
  children: [{ label: 'Deadlines', href: '/area/deadlines' }],
  entries: [
    {
      title: 'Parallel approval steps',
      href: '/changelog/parallel-approval-steps',
      summary: 'Two steps can now run at the same time.',
      collection: 'changelog',
      publishedAt: '2026-08-27T09:00:00.000Z',
    },
    { title: 'An unrouted note', href: null, summary: null, collection: 'note', publishedAt: null },
  ],
  page: {
    current: 2,
    totalPages: 3,
    previousHref: '/area/policies',
    nextHref: '/area/policies?page=3',
  },
  locale: 'en',
  labels: LABELS,
}

describe('the term archive', () => {
  const html = serialize(renderTermArchive(INPUT))

  it('opens on the term as the one h1, under its breadcrumb', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toContain('<h1 class="cs-page-head__title">Policies</h1>')
    expect(html).toContain('<nav class="cs-archive__breadcrumb" aria-label="Breadcrumb">')
    expect(html).toMatch(/^<main class="cg-main cs-main cs-archive" id="cg-main">/)
  })

  it('lists sub-terms as a named row of links', () => {
    expect(html).toContain('aria-label="Sub-areas"')
    expect(html).toContain('<a href="/area/deadlines">Deadlines</a>')
  })

  it('prints a dated entry’s date in the index, and no date for an undated one', () => {
    expect(html).toContain(
      '<time class="cs-index__date" datetime="2026-08-27T09:00:00.000Z">Aug 27, 2026</time>',
    )
    expect(html).toContain('data-dated="false"')
  })

  it('links an entry with a route and sets one without a route as text', () => {
    expect(html).toContain(
      '<a class="cs-index__link" href="/changelog/parallel-approval-steps">Parallel approval steps</a>',
    )
    expect(html).toContain('<h2 class="cs-index__title">An unrouted note</h2>')
  })

  it('pages with two arrow links that carry their words', () => {
    expect(html).toContain('rel="prev" href="/area/policies">Newer</a>')
    expect(html).toContain('rel="next" href="/area/policies?page=3">Older</a>')
  })

  it('shows the empty label instead of an empty list, and no pager on a single page', () => {
    const empty = serialize(
      renderTermArchive({
        ...INPUT,
        ancestors: [],
        children: [],
        entries: [],
        page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
      }),
    )
    expect(empty).toContain('<p class="cs-empty">Nothing is filed here yet.</p>')
    expect(empty).not.toContain('cs-archive__pager')
    expect(empty).not.toContain('cs-archive__breadcrumb')
  })

  it('emits no script and no inline handler', () => {
    expect(html).not.toMatch(/<script|\son[a-z]+="/i)
  })
})
