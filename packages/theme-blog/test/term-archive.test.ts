import type { TermArchiveInput } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const BASE: TermArchiveInput = {
  taxonomyName: 'category',
  term: { label: 'Reading', slug: 'reading' },
  ancestors: [],
  children: [],
  entries: [
    {
      title: 'Reading on the 7:52',
      href: '/en/blog/reading-on-the-752',
      summary: 'Three mornings a week, twenty-five minutes from Leeds to York.',
      collection: 'post',
      publishedAt: '2026-05-31T08:40:00.000Z',
    },
    {
      title: 'Letter: the slow week',
      href: '/en/blog/letter-the-slow-week',
      summary: null,
      collection: 'post',
      publishedAt: '2026-02-15T07:30:00.000Z',
    },
    {
      title: 'Books I reread every winter',
      href: null,
      summary: 'Five books that come off the shelf in the first week of January.',
      collection: 'post',
      publishedAt: '2025-01-12T09:10:00.000Z',
    },
    {
      title: 'An undated note',
      href: '/en/blog/undated',
      summary: null,
      collection: 'post',
      publishedAt: null,
    },
  ],
  page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
  locale: 'en',
  labels: {
    empty: 'Nothing published under this topic yet.',
    previous: 'Newer',
    next: 'Older',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pagination',
    subterms: 'Sub-topics',
  },
}

const html = (input: TermArchiveInput = BASE): string => serialize(renderTermArchive(input))

describe('renderTermArchive, a topic set as a front', () => {
  it('is a real <main id="cg-main">, the mandatory skip-link target', () => {
    expect(html()).toMatch(/^<main class="cg-main cg-archive" id="cg-main">/)
  })

  it('sets the taxonomy as the kicker and the term as the only h1', () => {
    const out = html()
    expect(out).toContain('<p class="cg-archive__kicker">category</p>')
    expect(out).toContain('<h1 class="cg-archive__title">Reading</h1>')
    expect(out.match(/<h1/g)).toHaveLength(1)
  })

  it('composes the newest entry as a lead and the rest as a row of secondaries, like the home front', () => {
    const out = html()
    expect(out).toContain('<section class="cg-section cg-collection" data-form="front">')
    expect(out).toContain('<div class="cg-front" data-secondaries="3">')
    expect(out.match(/cg-story--lead/g)).toHaveLength(1)
    expect(out.match(/<li class="cg-front__item">/g)).toHaveLength(3)
  })

  it('gives the lead its standfirst and its full date, since a topic page reads by day', () => {
    const out = html()
    const lead = out.slice(out.indexOf('cg-front__lead'), out.indexOf('cg-front__secondaries'))
    expect(lead).toContain(
      '<h2 class="cg-story__title"><a class="cg-story__link" href="/en/blog/reading-on-the-752">Reading on the 7:52</a></h2>',
    )
    expect(lead).toContain(
      '<p class="cg-story__standfirst">Three mornings a week, twenty-five minutes from Leeds to York.</p>',
    )
    expect(lead).toContain('<time datetime="2026-05-31T08:40:00.000Z">May 31, 2026</time>')
  })

  it('renders an entry with no summary or no date without an empty element', () => {
    const out = html()
    const letter = out.slice(
      out.indexOf('Letter: the slow week') - 40,
      out.indexOf('Books I reread'),
    )
    expect(letter).not.toContain('cg-story__standfirst')
    const undated = out.slice(out.indexOf('An undated note') - 40)
    expect(undated).not.toContain('<time')
  })

  it('renders an unreachable entry as text, never a dead link', () => {
    expect(html()).toContain('<h2 class="cg-story__title">Books I reread every winter</h2>')
  })

  it('invents no picture and no topic for an entry: a term archive row carries neither', () => {
    const out = html()
    expect(out).not.toContain('<img')
    expect(out).not.toContain('cg-story__topic')
  })

  it('caps the secondaries row at three, whatever the term holds', () => {
    const many: TermArchiveInput = {
      ...BASE,
      entries: [
        ...BASE.entries,
        {
          title: 'A fifth note',
          href: '/en/blog/a-fifth-note',
          summary: null,
          collection: 'post',
          publishedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    }
    expect(html(many)).toContain('data-secondaries="3"')
  })

  it('renders the empty state honestly when nothing is classified', () => {
    const out = html({ ...BASE, entries: [] })
    expect(out).toContain(
      '<p class="cg-collection__empty">Nothing published under this topic yet.</p>',
    )
    expect(out).not.toContain('cg-front')
  })

  it('renders a breadcrumb only when there are ancestors', () => {
    expect(html()).not.toContain('cg-archive__breadcrumb')
    const out = html({ ...BASE, ancestors: [{ label: 'Subjects', href: '/en/subjects' }] })
    expect(out).toContain('<nav class="cg-archive__breadcrumb" aria-label="Breadcrumb">')
    expect(out).toContain('<a href="/en/subjects">Subjects</a>')
  })

  it('renders sub-terms as a labelled list of links when present', () => {
    const out = html({
      ...BASE,
      children: [{ label: 'Rereading', href: '/en/category/rereading' }],
    })
    expect(out).toContain('<ul class="cg-archive__children" aria-label="Sub-topics">')
    expect(out).toContain('Rereading')
  })

  it('renders a pager only when there is a previous or next page, with the host labels', () => {
    expect(html()).not.toContain('cg-archive__pager')
    const out = html({
      ...BASE,
      page: {
        current: 2,
        totalPages: 3,
        previousHref: '/en/category/reading',
        nextHref: '/en/category/reading?page=3',
      },
    })
    expect(out).toContain('<nav class="cg-archive__pager" aria-label="Pagination">')
    expect(out).toContain('rel="prev" href="/en/category/reading">Newer</a>')
    expect(out).toContain('rel="next" href="/en/category/reading?page=3">Older</a>')
  })
})
