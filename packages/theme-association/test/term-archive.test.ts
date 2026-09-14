import type { TermArchiveInput } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const LABELS: TermArchiveInput['labels'] = {
  empty: 'Nothing classified here yet.',
  previous: 'Previous',
  next: 'Next page',
  breadcrumb: 'Breadcrumb',
  pagination: 'Pagination',
  subterms: 'Sub-topics',
}

function baseInput(overrides: Partial<TermArchiveInput> = {}): TermArchiveInput {
  return {
    taxonomyName: 'topic',
    term: { label: 'Food', slug: 'food' },
    ancestors: [],
    children: [],
    entries: [],
    page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
    locale: 'en',
    labels: LABELS,
    ...overrides,
  }
}

const ENTRY = {
  title: 'Harvest supper',
  href: '/events/harvest-supper',
  summary: 'Three courses cooked by volunteers.',
  collection: 'event',
  publishedAt: '2026-09-01T09:00:00.000Z',
}

describe('renderTermArchive', () => {
  it('renders the term as the page h1, inside the skip link’s target', () => {
    const html = serialize(renderTermArchive(baseInput()))
    expect(html).toMatch(/^<main class="cg-main ca-main ca-archive" id="cg-main">/)
    expect(html).toContain('<h1 class="ca-page-head__title">Food</h1>')
    expect(html.match(/<h1[ >]/g)).toHaveLength(1)
  })

  it('shows the empty state when the term classifies nothing published', () => {
    const html = serialize(renderTermArchive(baseInput()))
    expect(html).toContain('<p class="ca-empty">Nothing classified here yet.</p>')
  })

  it('lists entries as an index of titles, publication dates and summaries', () => {
    const html = serialize(renderTermArchive(baseInput({ entries: [ENTRY] })))
    expect(html).toContain(
      '<h2 class="ca-index__title"><a class="ca-index__link" href="/events/harvest-supper">Harvest supper</a></h2>',
    )
    expect(html).toContain('<time datetime="2026-09-01T09:00:00.000Z">September 1, 2026</time>')
    expect(html).toContain('Three courses cooked by volunteers.')
  })

  it('renders an unresolvable entry as plain text, never a dead link, and no empty date', () => {
    const html = serialize(
      renderTermArchive(baseInput({ entries: [{ ...ENTRY, href: null, publishedAt: null }] })),
    )
    expect(html).toContain('<h2 class="ca-index__title">Harvest supper</h2>')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('ca-index__date')
  })

  it('renders a breadcrumb only when there are ancestors', () => {
    expect(serialize(renderTermArchive(baseInput()))).not.toContain('ca-archive__breadcrumb')
    const withAncestors = serialize(
      renderTermArchive(
        baseInput({ ancestors: [{ label: 'Programmes', href: '/topic/programmes' }] }),
      ),
    )
    expect(withAncestors).toContain('<nav class="ca-archive__breadcrumb" aria-label="Breadcrumb">')
  })

  it('renders sub-terms as a labelled list when present', () => {
    const html = serialize(
      renderTermArchive(
        baseInput({ children: [{ label: 'Food bank', href: '/topic/food-bank' }] }),
      ),
    )
    expect(html).toContain('<ul class="ca-archive__terms" aria-label="Sub-topics">')
  })

  it('draws a pager of arrow links whose arrows ride on a word', () => {
    const html = serialize(
      renderTermArchive(
        baseInput({ page: { current: 2, totalPages: 3, previousHref: '/p/1', nextHref: '/p/3' } }),
      ),
    )
    expect(html).toContain('<nav class="ca-archive__pager" aria-label="Pagination">')
    expect(html).toContain('<span class="ca-arrow-link__start">Previous</span></a>')
    expect(html).toContain('Next <span class="ca-arrow-link__end">page</span></a>')
  })

  it('renders no pager on a single page, and no script anywhere', () => {
    const html = serialize(renderTermArchive(baseInput({ entries: [ENTRY] })))
    expect(html).not.toContain('ca-archive__pager')
    expect(html).not.toMatch(/<script/i)
  })
})
