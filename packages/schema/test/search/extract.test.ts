import { describe, expect, it } from 'vitest'
import {
  buildExcerpt,
  extractBlockText,
  extractRichText,
  searchDocumentFor,
} from '../../src/search/extract.js'
import { queryTokens } from '../../src/search/text.js'
import type { ContentEntry } from '../../src/store/types.js'
import type { CollectionDefinition } from '../../src/types.js'

const collection: CollectionDefinition = {
  name: 'extract_article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: {
    title: { kind: 'text', options: { max: 200 } },
    summary: { kind: 'text', options: { max: 500 } },
    body: { kind: 'richText', options: {} },
    slug: { kind: 'slug', options: { from: 'title' } },
    rating: { kind: 'number', options: {} },
    meta: { kind: 'json', options: {} },
    cover: { kind: 'media', options: { accept: ['image'] } },
    zone: { kind: 'blocks', options: { allow: '*' } },
  },
  permissions: { read: ['public'] },
}

function entry(overrides: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id: '0195f0a0-0000-7000-8000-000000000001',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    status: 'published',
    deletedAt: null,
    locale: 'fr',
    translationOf: null,
    version: 1,
    provenance: 'human',
    provenanceDetail: null,
    publishedAt: null,
    state: 'published',
    values: {},
    blocks: {},
    ...overrides,
  }
}

describe('extractRichText', () => {
  it('keeps the text of the spans and drops the structure around them', () => {
    const document = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'h2',
        children: [
          { _key: 's1', _type: 'span', text: 'Le vitrail ', marks: ['strong'] },
          { _key: 's2', _type: 'span', text: 'restauré', marks: ['m1'] },
        ],
        markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.test/atelier' }],
      },
    ]

    const text = extractRichText(document)

    expect(text).toBe('Le vitrail restauré')
    expect(text).not.toContain('span')
    expect(text).not.toContain('strong')
    expect(text).not.toContain('example.test')
  })

  it('keeps the caption of a media node, which is prose', () => {
    expect(
      extractRichText([{ _key: 'm1', _type: 'media', id: 'media-7', caption: 'La rose nord' }]),
    ).toBe('La rose nord')
  })

  it('returns nothing for a value that is not a rich text document', () => {
    expect(extractRichText(null)).toBe('')
    expect(extractRichText('plain')).toBe('')
    expect(extractRichText({ _type: 'block' })).toBe('')
  })
})

describe('extractBlockText', () => {
  it('collects the strings of a block and skips its identifiers', () => {
    const text = extractBlockText({
      key: 'k1',
      type: 'callout',
      data: { heading: 'Attention', body: 'Chantier en cours', variant: 'warning' },
    })

    expect(text).toBe('Attention Chantier en cours')
  })

  it('reaches the text of a nested block', () => {
    const text = extractBlockText({
      key: 'k1',
      type: 'columns',
      data: { columns: [{ blocks: [{ _type: 'text', body: 'Colonne gauche' }] }] },
    })

    expect(text).toBe('Colonne gauche')
  })

  it('stops rather than recursing forever on a deeply nested block', () => {
    let data: Record<string, unknown> = { body: 'fond' }
    for (let depth = 0; depth < 40; depth += 1) data = { nested: data }

    expect(extractBlockText({ key: 'k', type: 'deep', data })).toBe('')
  })
})

describe('searchDocumentFor', () => {
  it('indexes text fields, rich text and blocks, and nothing else', () => {
    const document = searchDocumentFor(
      collection,
      entry({
        values: {
          title: 'Cathédrale',
          summary: 'Un chantier de dix ans',
          slug: 'cathedrale-de-reims',
          rating: 5,
          meta: { internalCode: 'XYZ-42' },
          cover: 'media-1',
          body: [
            {
              _key: 'b1',
              _type: 'block',
              style: 'normal',
              children: [{ _key: 's1', _type: 'span', text: 'Le vitrail restauré', marks: [] }],
              markDefs: [],
            },
          ],
        },
        blocks: { zone: [{ key: 'k1', type: 'quote', data: { text: 'Patrimoine mondial' } }] },
      }),
    )

    expect(document.body).toContain('Un chantier de dix ans')
    expect(document.body).toContain('Le vitrail restauré')
    expect(document.body).toContain('Patrimoine mondial')
    // A slug is a URL fragment, a json field is configuration and a media value
    // is an identifier. None of them is prose, and all of them would rank.
    expect(document.body).not.toContain('cathedrale-de-reims')
    expect(document.body).not.toContain('XYZ-42')
    expect(document.body).not.toContain('media-1')
  })

  it('carries the entry identity, so the index can be kept in step', () => {
    const document = searchDocumentFor(collection, entry({ values: { title: 'Cathédrale' } }))

    expect(document).toMatchObject({
      collection: 'extract_article',
      locale: 'fr',
      status: 'published',
      title: 'Cathédrale',
    })
  })

  it('repeats the title inside the body, which is the only portable boost', () => {
    const document = searchDocumentFor(collection, entry({ values: { title: 'Cathédrale' } }))

    expect(document.body.startsWith('Cathédrale')).toBe(true)
  })

  it('falls back to the first text field when there is no title', () => {
    const fallback: CollectionDefinition = {
      name: 'extract_note',
      labels: { singular: 'Note', plural: 'Notes' },
      fields: { heading: { kind: 'text', options: {} } },
      permissions: { read: ['public'] },
    }

    expect(searchDocumentFor(fallback, entry({ values: { heading: 'Sans titre' } })).title).toBe(
      'Sans titre',
    )
  })

  it('prefers a field named "name" over one declared earlier, when there is no "title" (fiche 01 task 1)', () => {
    const collectionWithName: CollectionDefinition = {
      name: 'extract_product',
      labels: { singular: 'Product', plural: 'Products' },
      fields: {
        internalCode: { kind: 'text', options: {} },
        name: { kind: 'text', options: {} },
      },
      permissions: { read: ['public'] },
    }

    const document = searchDocumentFor(
      collectionWithName,
      entry({ values: { internalCode: 'SKU-001', name: 'Wool jumper' } }),
    )

    expect(document.title).toBe('Wool jumper')
  })

  it('accepts an entry with nothing indexable rather than refusing it', () => {
    const document = searchDocumentFor(collection, entry())

    expect(document.title).toBe('')
    expect(document.body).toBe('')
  })
})

describe('buildExcerpt', () => {
  it('windows around the first match, keeping the original casing and accents', () => {
    const body =
      'La cathédrale de Reims a été restaurée après un chantier de dix ans, ' +
      "et l'atelier de vitraux a repris tout le mois de janvier."
    const { text, matches } = buildExcerpt(body, queryTokens('restauree'))

    // The stored body is condensed but never folded — so the excerpt keeps
    // "cathédrale" and "restaurée" exactly as an editor typed them.
    expect(text).toContain('restaurée')
    expect(matches.length).toBe(1)
    const match = matches[0] as { start: number; end: number }
    expect(text.slice(match.start, match.end)).toBe('restaurée')
  })

  it('matches a query term as a prefix, the same rule every FTS driver applies', () => {
    const { matches } = buildExcerpt(
      'Le chantier de restauration a commencé.',
      queryTokens('resta'),
    )
    expect(matches.length).toBe(1)
  })

  it('returns the opening of the text, unmarked, when nothing matches', () => {
    const { text, matches } = buildExcerpt(
      'Un texte sans rapport avec la recherche.',
      queryTokens('cathedrale'),
    )
    expect(matches).toEqual([])
    expect(text.startsWith('Un texte sans rapport')).toBe(true)
  })

  it('marks every match inside the window, not only the first', () => {
    const body = 'restauration restauration restauration restauration restauration'
    const { matches } = buildExcerpt(body, queryTokens('restauration'))
    expect(matches.length).toBeGreaterThan(1)
  })

  it('never turns the excerpt into markup — the caller escapes it at render (R3/R8)', () => {
    // A query term that happens to sit inside text an editor pasted straight
    // from an attacker-controlled import: the excerpt is still plain text,
    // with no tag ever synthesised around a match.
    const body = 'Un commentaire dit : <script>alert(1)</script> et rien de plus.'
    const { text } = buildExcerpt(body, queryTokens('script'))
    expect(text).not.toMatch(/<mark|<b>|<strong/u)
    expect(text).toContain('<script>alert(1)</script>')
  })

  it('returns no matches and a bounded opening when there are no query tokens', () => {
    const { text, matches } = buildExcerpt('Un texte quelconque.'.repeat(20), [])
    expect(matches).toEqual([])
    expect(text.length).toBeLessThanOrEqual(200)
  })
})
