import { serialize, type TermArchiveInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { fallbackArchive } from '../src/commands/term-archive-page.js'

/**
 * The host's own archive, rendered for a theme that has no `renderTermArchive`.
 * It must honour the same `showEntries` field a theme does (contract D
 * `theme@1.11`), and — unlike before that field — draw the sub-term list, since
 * a page that shows only sub-terms would otherwise be blank.
 */

const base: TermArchiveInput = {
  taxonomyName: 'Topic',
  term: { label: 'Cooking', slug: 'cooking' },
  ancestors: [],
  children: [{ label: 'Desserts', href: '/topic/desserts' }],
  entries: [
    {
      title: 'Braising, slowly',
      href: '/blog/braising-slowly',
      summary: null,
      collection: 'article',
      publishedAt: null,
    },
  ],
  page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
  locale: 'en',
  labels: {
    empty: 'Nothing is filed here yet.',
    previous: 'Previous',
    next: 'Next',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pagination',
    subterms: 'Sub-categories',
  },
}

describe('the host fallback term archive', () => {
  it('lists entries and sub-terms when showEntries is absent', () => {
    const html = serialize(fallbackArchive(base))
    expect(html).toContain('href="/blog/braising-slowly"')
    expect(html).toContain('href="/topic/desserts"')
  })

  it('draws neither the entries nor the empty message when showEntries is false', () => {
    const html = serialize(fallbackArchive({ ...base, showEntries: false }))
    expect(html).toContain('href="/topic/desserts"')
    expect(html).not.toContain('Braising, slowly')

    const emptied = serialize(fallbackArchive({ ...base, entries: [], showEntries: false }))
    expect(emptied).not.toContain(base.labels.empty)
  })

  it('still says nothing is filed for an empty list when entries are shown', () => {
    const html = serialize(fallbackArchive({ ...base, children: [], entries: [] }))
    expect(html).toContain(base.labels.empty)
  })
})
