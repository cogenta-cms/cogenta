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
  it('renders a titled index, the term as the page h1', () => {
    const html = serialize(renderTermArchive(BASE))
    expect(html).toMatch(/^<main class="cg-main cd-archive" id="cg-main">/)
    expect(html).toContain('<h1 class="cd-archive__title">Deployment</h1>')
  })

  it('shows the translated empty state when nothing is classified', () => {
    expect(serialize(renderTermArchive(BASE))).toContain(
      '<p class="cd-empty">Nothing classified here yet.</p>',
    )
  })

  it('renders every entry as a ruled row with its own link, summary and readable date', () => {
    const html = serialize(
      renderTermArchive({
        ...BASE,
        entries: [
          {
            title: 'Deploying to production',
            href: '/docs/deploying-to-production',
            summary: 'Run the server on PostgreSQL.',
            collection: 'doc_page',
            publishedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    expect(html).toContain('<a class="cd-index__link" href="/docs/deploying-to-production">')
    expect(html).toContain('Run the server on PostgreSQL.')
    expect(html).toContain('January 1, 2026')
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

  it('renders the breadcrumb only when there are ancestors, ending on the term', () => {
    const withAncestors = serialize(
      renderTermArchive({ ...BASE, ancestors: [{ label: 'Topics', href: '/topics' }] }),
    )
    expect(withAncestors).toContain('aria-label="Breadcrumb"')
    expect(withAncestors).toContain('<li aria-current="page">Deployment</li>')
    expect(serialize(renderTermArchive(BASE))).not.toContain('aria-label="Breadcrumb"')
  })

  it('lists sub-terms as links', () => {
    const html = serialize(
      renderTermArchive({ ...BASE, children: [{ label: 'Docker', href: '/topic/docker' }] }),
    )
    expect(html).toContain(
      '<ul class="cd-archive__children" aria-label="Sub-terms"><li><a href="/topic/docker">Docker</a></li></ul>',
    )
  })

  it('renders the pager only when there is a previous or next page', () => {
    const withPager = serialize(
      renderTermArchive({ ...BASE, page: { ...BASE.page, nextHref: '/deployment?page=2' } }),
    )
    expect(withPager).toContain('aria-label="Pagination"')
    expect(withPager).toContain('rel="next"')
    expect(serialize(renderTermArchive(BASE))).not.toContain('aria-label="Pagination"')
  })
})
