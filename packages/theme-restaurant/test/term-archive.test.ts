import { serialize, type TermArchiveInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const INPUT: TermArchiveInput = {
  taxonomyName: 'produce',
  term: { label: 'Mushrooms', slug: 'mushrooms' },
  ancestors: [{ label: 'Produce', href: '/produce' }],
  children: [{ label: 'Ceps', href: '/produce/mushrooms/ceps' }],
  entries: [
    {
      title: 'Risotto of ceps and girolles',
      href: '/menu/ceps-risotto',
      summary: 'Carnaroli rice cooked in a stock of roasted mushroom trimmings.',
      collection: 'menu_item',
      publishedAt: null,
    },
    { title: 'Unrouted note', href: null, summary: null, collection: 'note', publishedAt: null },
  ],
  page: { current: 1, totalPages: 2, previousHref: null, nextHref: '/produce/mushrooms?page=2' },
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
    expect(html).toMatch(/^<main class="cg-main cr-main cr-archive" id="cg-main">/)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('<h1 class="cr-page-head__title">Mushrooms</h1>')
  })

  it('draws the breadcrumb as a labelled ordered list', () => {
    expect(html).toContain('<nav class="cr-archive__breadcrumb" aria-label="Breadcrumb">')
    expect(html).toContain('<a href="/produce">Produce</a>')
  })

  it('lists sub-terms as a labelled line of links', () => {
    expect(html).toContain('aria-label="Sub-terms"')
    expect(html).toContain('href="/produce/mushrooms/ceps">Ceps</a>')
  })

  it('lists entries as an index, linking only the routed ones, never as a menu without prices', () => {
    expect(html).toContain(
      '<a class="cr-index__link" href="/menu/ceps-risotto">Risotto of ceps and girolles</a>',
    )
    expect(html).toContain('<h2 class="cr-index__name">Unrouted note</h2>')
    expect(html).not.toContain('cr-menu')
  })

  it('pages with arrow links, and only in the direction there is a page', () => {
    expect(html).toContain(
      '<a class="cr-arrow-link" rel="next" href="/produce/mushrooms?page=2">Next</a>',
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
    expect(empty).toContain('<p class="cr-empty">Nothing is filed here yet.</p>')
    expect(empty).not.toContain('cr-archive__breadcrumb')
    expect(empty).not.toContain('cr-archive__pager')
  })
})
