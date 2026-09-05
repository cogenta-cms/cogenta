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
  subterms: 'Sub-categories',
}

function baseInput(overrides: Partial<TermArchiveInput> = {}): TermArchiveInput {
  return {
    taxonomyName: 'programme',
    term: { label: 'Food security', slug: 'food-security' },
    ancestors: [],
    children: [],
    entries: [],
    page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
    locale: 'en',
    labels: LABELS,
    ...overrides,
  }
}

describe('renderTermArchive', () => {
  it('renders the term label as the page h1', () => {
    const html = serialize(renderTermArchive(baseInput()))
    expect(html).toContain('<h1 class="cg-archive__title">Food security</h1>')
  })

  it('renders the empty state when the term classifies nothing published', () => {
    const html = serialize(renderTermArchive(baseInput()))
    expect(html).toContain('cg-archive__empty')
    expect(html).toContain('Nothing classified here yet.')
  })

  it('renders a dated card with a big day/month badge for an entry with a publication date', () => {
    const html = serialize(
      renderTermArchive(
        baseInput({
          entries: [
            {
              title: 'Community clean-up day',
              href: '/events/community-clean-up-day',
              summary: 'A morning of volunteering.',
              collection: 'event',
              publishedAt: '2026-11-14T09:00:00.000Z',
            },
          ],
        }),
      ),
    )
    expect(html).toContain('cg-archive-card')
    expect(html).toContain('cg-archive-card__day')
    expect(html).toContain('cg-archive-card__month')
    expect(html).toContain('Community clean-up day')
    expect(html).toContain('A morning of volunteering.')
  })

  it('renders a card with no date badge for an entry with no publication instant', () => {
    const html = serialize(
      renderTermArchive(
        baseInput({
          entries: [
            {
              title: 'A page with no date',
              href: '/pages/no-date',
              summary: null,
              collection: 'page',
              publishedAt: null,
            },
          ],
        }),
      ),
    )
    expect(html).toContain('A page with no date')
    expect(html).not.toContain('cg-archive-card__day')
  })

  it('renders an unresolvable entry as plain text, never a dead link', () => {
    const html = serialize(
      renderTermArchive(
        baseInput({
          entries: [
            {
              title: 'Unreachable',
              href: null,
              summary: null,
              collection: 'event',
              publishedAt: null,
            },
          ],
        }),
      ),
    )
    expect(html).toContain('Unreachable')
    expect(html).not.toContain('<a')
  })

  it('renders a breadcrumb only when there are ancestors', () => {
    const withoutAncestors = serialize(renderTermArchive(baseInput()))
    expect(withoutAncestors).not.toContain('cg-archive__breadcrumb')

    const withAncestors = serialize(
      renderTermArchive(baseInput({ ancestors: [{ label: 'Programmes', href: '/programmes' }] })),
    )
    expect(withAncestors).toContain('cg-archive__breadcrumb')
    expect(withAncestors).toContain('Programmes')
  })

  it('renders sub-terms as a labelled list when present', () => {
    const html = serialize(
      renderTermArchive(
        baseInput({ children: [{ label: 'Emergency food', href: '/programmes/emergency-food' }] }),
      ),
    )
    expect(html).toContain('cg-archive__children')
    expect(html).toContain('Emergency food')
  })

  it('renders a pager only when there is a previous or next page', () => {
    const withoutPager = serialize(renderTermArchive(baseInput()))
    expect(withoutPager).not.toContain('cg-archive__pager')

    const withPager = serialize(
      renderTermArchive(
        baseInput({ page: { current: 2, totalPages: 3, previousHref: '/p/1', nextHref: '/p/3' } }),
      ),
    )
    expect(withPager).toContain('cg-archive__pager')
    expect(withPager).toContain('rel="prev"')
    expect(withPager).toContain('rel="next"')
  })

  it('emits no script tag anywhere', () => {
    const html = serialize(
      renderTermArchive(
        baseInput({
          entries: [
            {
              title: 'Community clean-up day',
              href: '/events/community-clean-up-day',
              summary: 'A morning of volunteering.',
              collection: 'event',
              publishedAt: '2026-11-14T09:00:00.000Z',
            },
          ],
        }),
      ),
    )
    expect(html).not.toMatch(/<script/i)
  })
})
