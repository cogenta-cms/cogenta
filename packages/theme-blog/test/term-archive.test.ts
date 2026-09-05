import type { TermArchiveInput } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const BASE: TermArchiveInput = {
  taxonomyName: 'category',
  term: { label: 'Writing', slug: 'writing' },
  ancestors: [],
  children: [],
  entries: [
    {
      title: 'Why I still write in a plain-text editor',
      href: '/en/blog/plain-text-editor',
      summary: 'Ten years of trying every tool that promised to make writing easier.',
      collection: 'post',
      publishedAt: '2026-02-11T09:00:00.000Z',
    },
  ],
  page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
  locale: 'en',
  labels: {
    empty: 'Nothing published under this topic yet.',
    previous: 'Previous',
    next: 'Next',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pagination',
    subterms: 'Sub-topics',
  },
}

describe('renderTermArchive — a category/tag index', () => {
  it('renders the taxonomy kicker and the term label as the h1', () => {
    const html = serialize(renderTermArchive(BASE))
    expect(html).toContain('cg-archive__kicker')
    expect(html).toContain('category')
    expect(html).toMatch(/<h1[^>]*>Writing<\/h1>/)
  })

  it('reuses the same card grid collectionList already styles, with a date but no image', () => {
    const html = serialize(renderTermArchive(BASE))
    expect(html).toContain('class="cg-list" data-layout="grid"')
    expect(html).toContain('cg-list__card')
    expect(html).not.toMatch(/<img/)
    expect(html).toContain('Why I still write in a plain-text editor')
  })

  it('renders the empty state honestly when nothing is classified', () => {
    const html = serialize(renderTermArchive({ ...BASE, entries: [] }))
    expect(html).toContain('cg-list__empty')
    expect(html).toContain('Nothing published under this topic yet.')
  })

  it('renders a breadcrumb only when there are ancestors', () => {
    const withoutAncestors = serialize(renderTermArchive(BASE))
    expect(withoutAncestors).not.toContain('cg-archive__breadcrumb')

    const withAncestors = serialize(
      renderTermArchive({
        ...BASE,
        ancestors: [{ label: 'Topics', href: '/en/topics' }],
      }),
    )
    expect(withAncestors).toContain('cg-archive__breadcrumb')
    expect(withAncestors).toContain('Topics')
  })

  it('renders sub-terms as a linked list when present', () => {
    const html = serialize(
      renderTermArchive({
        ...BASE,
        children: [{ label: 'Editing', href: '/en/category/editing' }],
      }),
    )
    expect(html).toContain('cg-archive__children')
    expect(html).toContain('Editing')
  })

  it('renders a pager only when there is a previous or next page', () => {
    const withoutPager = serialize(renderTermArchive(BASE))
    expect(withoutPager).not.toContain('cg-archive__pager')

    const withPager = serialize(
      renderTermArchive({
        ...BASE,
        page: {
          current: 2,
          totalPages: 3,
          previousHref: '/en/category/writing?page=1',
          nextHref: null,
        },
      }),
    )
    expect(withPager).toContain('cg-archive__pager')
    expect(withPager).toContain('rel="prev"')
  })

  it('is a real <main id="cg-main">, the mandatory skip-link target', () => {
    expect(serialize(renderTermArchive(BASE))).toMatch(
      /^<main class="cg-main cg-archive" id="cg-main">/,
    )
  })
})
