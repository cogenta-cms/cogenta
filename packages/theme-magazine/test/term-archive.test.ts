import { serialize, type TermArchiveInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const LABELS = {
  empty: 'Nothing is filed under this term yet.',
  previous: 'Newer',
  next: 'Older',
  breadcrumb: 'Breadcrumb',
  pagination: 'Pages',
  subterms: 'Subsections',
}

function entries(count: number): TermArchiveInput['entries'] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Story ${index + 1}`,
    href: `/articles/story-${index + 1}`,
    summary: index === 2 ? null : `Standfirst ${index + 1}.`,
    collection: 'article',
    publishedAt:
      index === 5 ? null : `2026-09-${String(13 - index).padStart(2, '0')}T07:00:00.000Z`,
  }))
}

const INPUT: TermArchiveInput = {
  taxonomyName: 'section',
  term: { label: 'Culture', slug: 'culture' },
  ancestors: [],
  children: [],
  entries: entries(7),
  page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
  locale: 'en',
  labels: LABELS,
}

describe('renderTermArchive, a section front', () => {
  const html = serialize(renderTermArchive(INPUT))

  it('owns the page: main, the skip link target, one h1 naming the term', () => {
    expect(html).toMatch(/^<main class="cg-main cg-archive" id="cg-main">/)
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toContain('<h1 class="cg-archive__title">Culture</h1>')
  })

  it('sets the taxonomy as a kicker above the term', () => {
    expect(html).toContain('<p class="cg-archive__kicker">section</p>')
  })

  it('composes the stories like the front page: a lead, three briefs, the rest in a row', () => {
    expect(html).toContain('<div class="cg-front" data-briefs="3" data-more="3">')
    expect(html.match(/cg-story--lead/g)).toHaveLength(1)
    expect(html.match(/<li class="cg-front__brief">/g)).toHaveLength(3)
    expect(html.match(/<li class="cg-front__item">/g)).toHaveLength(3)
  })

  it('titles every story at h2 under the term, and links each one', () => {
    expect(html).toContain(
      '<h2 class="cg-story__title"><a class="cg-story__link" href="/articles/story-1">Story 1</a></h2>',
    )
  })

  it('sets a story with no summary or no date without an empty element', () => {
    const third = html.slice(html.indexOf('Story 3'), html.indexOf('Story 4'))
    expect(third).not.toContain('cg-story__standfirst')
    const sixth = html.slice(html.indexOf('Story 6'), html.indexOf('Story 7'))
    expect(sixth).not.toContain('<time')
  })

  it('sets an entry with no route as plain text, never a dead link', () => {
    const out = serialize(
      renderTermArchive({
        ...INPUT,
        entries: [{ ...(INPUT.entries[0] as TermArchiveInput['entries'][number]), href: null }],
      }),
    )
    expect(out).toContain('<h2 class="cg-story__title">Story 1</h2>')
  })

  it('invents no picture and no kicker for a story', () => {
    expect(html).not.toContain('<img')
    expect(html).not.toContain('cg-story__kicker')
  })

  it('says so in one line when the term classifies nothing', () => {
    const out = serialize(renderTermArchive({ ...INPUT, entries: [] }))
    expect(out).toContain(`<p class="cg-empty">${LABELS.empty}</p>`)
    expect(out).not.toContain('cg-front')
  })

  it('renders the breadcrumb and the sub-terms with the labels the host resolved', () => {
    const out = serialize(
      renderTermArchive({
        ...INPUT,
        ancestors: [{ label: 'Arts', href: '/section/arts' }],
        children: [{ label: 'Theater', href: '/section/theater' }],
      }),
    )
    expect(out).toContain('<nav class="cg-archive__breadcrumb" aria-label="Breadcrumb">')
    expect(out).toContain('<ul class="cg-archive__children" aria-label="Subsections">')
  })

  it('renders the pager only when there is another page, with rel on each link', () => {
    expect(html).not.toContain('cg-archive__pager')
    const out = serialize(
      renderTermArchive({
        ...INPUT,
        page: {
          current: 2,
          totalPages: 3,
          previousHref: '/section/culture',
          nextHref: '/section/culture?page=3',
        },
      }),
    )
    expect(out).toContain(
      '<a class="cg-archive__pager-link" rel="prev" href="/section/culture">Newer</a>',
    )
    expect(out).toContain(
      '<a class="cg-archive__pager-link" rel="next" href="/section/culture?page=3">Older</a>',
    )
  })

  it('writes no word of its own: every label comes from the host', () => {
    const out = serialize(renderTermArchive({ ...INPUT, entries: [] }))
    const words = out
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    expect(words).toBe(`section Culture ${LABELS.empty}`)
  })
})
