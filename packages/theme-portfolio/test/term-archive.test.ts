import { serialize, type TermArchiveInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTermArchive } from '../src/render/term-archive.js'

const LABELS = {
  empty: 'Nothing is filed here yet.',
  previous: 'Newer',
  next: 'Older',
  breadcrumb: 'Breadcrumb',
  pagination: 'Pages',
  subterms: 'Sub-disciplines',
}

function entries(count: number): TermArchiveInput['entries'] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Project ${index + 1}`,
    href: index === 4 ? null : `/work/project-${index + 1}`,
    summary: index === 2 ? null : `Statement ${index + 1}.`,
    collection: 'project',
    publishedAt:
      index === 5 ? null : `20${String(25 - index).padStart(2, '0')}-06-01T09:00:00.000Z`,
  }))
}

const INPUT: TermArchiveInput = {
  taxonomyName: 'disciplines',
  term: { label: 'Identity', slug: 'identity' },
  ancestors: [],
  children: [],
  entries: entries(6),
  page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
  locale: 'en',
  labels: LABELS,
}

describe('renderTermArchive, the studio index of one term', () => {
  const html = serialize(renderTermArchive(INPUT))

  it('owns the page: main, the skip link target, one h1 naming the term', () => {
    expect(html).toMatch(/^<main class="cg-main cg-archive" id="cg-main">/)
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toContain('<h1 class="cg-archive__title">Identity</h1>')
  })

  it('sets the taxonomy’s own name above the term, in sentence case', () => {
    expect(html).toContain('<p class="cg-archive__kicker">Disciplines</p>')
  })

  it('lists every project as a row of the index, titled at h2 and linked', () => {
    expect(html).toContain('<ol class="cg-index" data-count="6">')
    expect(html.match(/<li class="cg-index__row">/g)).toHaveLength(6)
    expect(html).toContain(
      '<h2 class="cg-index__title"><a class="cg-work__link" href="/work/project-1">Project 1</a></h2>',
    )
  })

  it('sets the statement and the year of each project, and invents neither', () => {
    expect(html).toContain('<span class="cg-index__summary">Statement 1.</span>')
    expect(html).toContain('<span class="cg-index__cell" data-part="year">2025</span>')
    const third = html.split('<li class="cg-index__row">')[3] ?? ''
    expect(third).not.toContain('cg-index__summary')
    const sixth = html.split('<li class="cg-index__row">')[6] ?? ''
    expect(sixth).toContain('<span class="cg-index__cell" data-part="year"></span>')
  })

  it('sets an entry that has no page as text, never a dead link', () => {
    expect(html).toContain('<h2 class="cg-index__title">Project 5</h2>')
  })

  it('shows no picture: an archive entry carries none, and an empty frame is not shown instead', () => {
    expect(html).not.toContain('<img')
    expect(html).not.toContain('cg-work__media')
  })

  it('says so in one line when the term files nothing', () => {
    const empty = serialize(renderTermArchive({ ...INPUT, entries: [] }))
    expect(empty).toContain('<p class="cg-empty">Nothing is filed here yet.</p>')
    expect(empty).not.toContain('cg-index')
  })

  it('draws a breadcrumb of ancestors and a list of sub-terms, labelled by the host', () => {
    const nested = serialize(
      renderTermArchive({
        ...INPUT,
        ancestors: [{ label: 'Design', href: '/disciplines/design' }],
        children: [{ label: 'Naming', href: '/disciplines/naming' }],
      }),
    )
    expect(nested).toContain(
      '<nav class="cg-archive__breadcrumb" aria-label="Breadcrumb"><ol class="cg-archive__trail"><li><a href="/disciplines/design">Design</a></li></ol></nav>',
    )
    expect(nested).toContain(
      '<ul class="cg-archive__children" aria-label="Sub-disciplines"><li><a class="cg-arrow-link" href="/disciplines/naming">Naming</a></li></ul>',
    )
  })

  it('pages with the host’s words, the arrows drawn by the stylesheet in the right direction', () => {
    const paged = serialize(
      renderTermArchive({
        ...INPUT,
        page: {
          current: 2,
          totalPages: 3,
          previousHref: '/disciplines/identity',
          nextHref: '/disciplines/identity?page=3',
        },
      }),
    )
    expect(paged).toContain(
      '<nav class="cg-archive__pager" aria-label="Pages"><a class="cg-arrow-link" data-direction="back" rel="prev" href="/disciplines/identity">Newer</a><a class="cg-arrow-link" rel="next" href="/disciplines/identity?page=3">Older</a></nav>',
    )
    expect(html).not.toContain('cg-archive__pager')
  })

  it('writes no word of its own and no arrow glyph', () => {
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/[←-⇿]/)
    expect(text).not.toMatch(/\b(Projects|Archive|Filed under)\b/)
  })
})
