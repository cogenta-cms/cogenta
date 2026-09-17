import { describe, expect, it } from 'vitest'
import { renderArchiveIntro, type TermArchiveInput } from '../src/archive.js'
import { authorNode } from '../src/entry-header.js'
import { serialize } from '../src/html.js'

/** L37 (`theme@1.8`): a byline links to its author's archive, which opens on their bio. */

describe('a byline', () => {
  it('links to the author archive when the author has one', () => {
    const html = serialize(
      authorNode(
        { name: 'Camille Durand', href: '/archive/author/camille-durand' },
        { class: 'x' },
      ),
    )
    expect(html).toBe(
      '<a class="x" href="/archive/author/camille-durand" rel="author">Camille Durand</a>',
    )
  })

  it('stays plain text when there is no page behind the name', () => {
    expect(serialize(authorNode({ name: 'Camille Durand' }))).toBe('<span>Camille Durand</span>')
  })
})

const ARCHIVE: TermArchiveInput = {
  taxonomyName: 'Auteur',
  term: { label: 'Camille Durand', slug: '/archive/author/camille-durand' },
  ancestors: [],
  children: [],
  entries: [],
  page: { current: 1, totalPages: 1, previousHref: null, nextHref: null },
  locale: 'fr',
  labels: {
    empty: 'Rien',
    previous: 'Précédent',
    next: 'Suivant',
    breadcrumb: 'Fil',
    pagination: 'Pagination',
    subterms: 'Sous',
  },
}

describe('an archive intro', () => {
  it('draws the bio of an author archive', () => {
    const html = serialize(
      renderArchiveIntro({ ...ARCHIVE, intro: { text: 'Ingénieure réseaux.' } }) ?? '',
    )
    expect(html).toContain('<div class="cg-archive__intro">')
    expect(html).toContain('<p class="cg-archive__bio">Ingénieure réseaux.</p>')
  })

  it('draws nothing on a term or date archive', () => {
    expect(renderArchiveIntro(ARCHIVE)).toBeNull()
    expect(renderArchiveIntro({ ...ARCHIVE, intro: {} })).toBeNull()
  })
})
