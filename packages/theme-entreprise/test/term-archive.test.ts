import { serialize, type TermArchiveInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const base: TermArchiveInput = {
  taxonomyName: 'Topic',
  term: { label: 'Deployment', slug: 'deployment' },
  ancestors: [],
  children: [],
  entries: [],
  page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
  locale: 'en',
  labels: {
    empty: 'Nothing is filed here yet.',
    previous: 'Previous',
    next: 'Next',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pagination',
    subterms: 'Sub-topics',
  },
}

describe('renderTermArchive with showEntries: false', () => {
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
