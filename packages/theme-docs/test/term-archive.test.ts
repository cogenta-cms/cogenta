import type { TermArchiveInput } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const LABELS: TermArchiveInput['labels'] = {
  empty: 'Nothing classified here yet.',
  previous: 'Previous',
  next: 'Next',
  breadcrumb: 'Breadcrumb',
  pagination: 'Pagination',
  subterms: 'Sub-terms',
}

const BASE: TermArchiveInput = {
  taxonomyName: 'topic',
  term: { label: 'Deployment', slug: 'deployment' },
  ancestors: [],
  children: [],
  entries: [],
  page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
  locale: 'en',
  labels: LABELS,
}

describe('renderTermArchive', () => {
  it('renders a simple titled list — the term label as the page h1', () => {
    const html = serialize(renderTermArchive(BASE))
    expect(html).toMatch(/^<main class="cg-main cg-archive" id="cg-main">/)
    expect(html).toContain('<h1 class="cg-page__title">Deployment</h1>')
  })

  it('shows the translated empty state when nothing is classified', () => {
    const html = serialize(renderTermArchive(BASE))
    expect(html).toContain('Nothing classified here yet.')
  })

  it('renders every entry as a row with its own link', () => {
    const html = serialize(
      renderTermArchive({
        ...BASE,
        entries: [
          {
            title: 'Deploying to production',
            href: '/docs/deploying-to-production',
            summary: 'A step-by-step release checklist.',
            collection: 'doc_page',
            publishedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    expect(html).toContain('<a class="cg-list__link" href="/docs/deploying-to-production">')
    expect(html).toContain('A step-by-step release checklist.')
  })

  it('renders unresolvable entries as text, never a dead link', () => {
    const html = serialize(
      renderTermArchive({
        ...BASE,
        entries: [
          {
            title: 'An unrouted entry',
            href: null,
            summary: null,
            collection: 'doc_page',
            publishedAt: null,
          },
        ],
      }),
    )
    expect(html).toContain('An unrouted entry')
    expect(html).not.toMatch(/<a[^>]*>An unrouted entry/)
  })

  it('renders the breadcrumb only when there are ancestors', () => {
    const withAncestors = serialize(
      renderTermArchive({ ...BASE, ancestors: [{ label: 'Topics', href: '/topics' }] }),
    )
    expect(withAncestors).toContain('aria-label="Breadcrumb"')

    const without = serialize(renderTermArchive(BASE))
    expect(without).not.toContain('aria-label="Breadcrumb"')
  })

  it('renders the pager only when there is a previous or next page', () => {
    const withPager = serialize(
      renderTermArchive({ ...BASE, page: { ...BASE.page, nextHref: '/deployment?page=2' } }),
    )
    expect(withPager).toContain('aria-label="Pagination"')

    const without = serialize(renderTermArchive(BASE))
    expect(without).not.toContain('aria-label="Pagination"')
  })
})
