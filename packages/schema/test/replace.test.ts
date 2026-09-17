import { describe, expect, it } from 'vitest'
import { planEntryReplacement, replaceableFields } from '../src/replace.js'
import type { ContentEntry } from '../src/store/types.js'
import type { CollectionDefinition } from '../src/types.js'

/**
 * L34 step 1 — what a replacement would do, computed without writing
 * anything. The same function produces the preview a person approves and the
 * values that are later written, which is what makes "show, then apply"
 * worth trusting.
 */

const article: CollectionDefinition = {
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', required: true, options: { from: 'title', unique: true } },
    body: { kind: 'richText', options: {} },
    cover: { kind: 'media', options: {} },
    views: { kind: 'number', options: {} },
  },
  permissions: { read: ['public'] },
}

function entry(overrides: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id: 'e1',
    createdAt: '',
    updatedAt: '',
    createdBy: null,
    updatedBy: null,
    status: 'published',
    deletedAt: null,
    reviewState: 'none',
    assignedReviewer: null,
    visibility: 'public',
    locale: 'fr',
    translationOf: null,
    version: 1,
    provenance: 'human',
    provenanceDetail: null,
    publishedAt: null,
    state: 'published',
    values: { title: 'Cogenta arrive', slug: 'cogenta-arrive', cover: 'media-1', views: 3 },
    blocks: {},
    ...overrides,
  } as ContentEntry
}

describe('planning a replacement', () => {
  it('finds a phrase in a text field and says what it would become', () => {
    const plan = planEntryReplacement(article, entry(), { find: 'Cogenta', replace: 'Kogenta' })

    expect(plan.occurrences).toBe(1)
    expect(plan.hits).toEqual([
      { path: 'title', before: 'Cogenta arrive', after: 'Kogenta arrive', occurrences: 1 },
    ])
    expect(plan.values?.['title']).toBe('Kogenta arrive')
    // Named as the editor knows it today, not as it will read afterwards.
    expect(plan.title).toBe('Cogenta arrive')
  })

  it('never touches a slug, a media reference, a number or an id', () => {
    const plan = planEntryReplacement(article, entry(), { find: 'cogenta', replace: 'kogenta' })

    // The slug matches in lower case, and is deliberately left alone: changing
    // it silently breaks every link to the page.
    expect(plan.hits.map((hit) => hit.path)).not.toContain('slug')
    expect(plan.values?.['slug'] ?? 'cogenta-arrive').toBe('cogenta-arrive')
    expect(plan.values?.['cover'] ?? 'media-1').toBe('media-1')
    expect(plan.values?.['views'] ?? 3).toBe(3)
  })

  it('replaces inside rich text span by span, keeping marks, links and keys', () => {
    const body = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        markDefs: [{ _key: 'l1', _type: 'link', href: 'https://cogenta.example/docs' }],
        children: [
          { _key: 's1', _type: 'span', text: 'Cogenta est ', marks: [] },
          { _key: 's2', _type: 'span', text: 'documenté', marks: ['l1', 'strong'] },
          { _key: 's3', _type: 'span', text: ' — Cogenta, donc.', marks: [] },
        ],
      },
    ]
    const plan = planEntryReplacement(article, entry({ values: { title: 'x', body } as never }), {
      find: 'Cogenta',
      replace: 'Kogenta',
    })

    const written = plan.values?.['body'] as typeof body
    expect(written[0]?.children.map((span) => span.text)).toEqual([
      'Kogenta est ',
      'documenté',
      ' — Kogenta, donc.',
    ])
    // The formatting survives: the same keys, the same marks, and a link
    // whose href was left alone even though it contains the phrase.
    expect(written[0]?.children.map((span) => span._key)).toEqual(['s1', 's2', 's3'])
    expect(written[0]?.children[1]?.marks).toEqual(['l1', 'strong'])
    expect(written[0]?.markDefs[0]?.href).toBe('https://cogenta.example/docs')
  })

  it('finds a phrase cut in two by a formatting run, and writes it into the span it starts in', () => {
    // "Cogen|ta" — the last two letters are bold. Span by span, this was
    // invisible; it is exactly the occurrence a person finds afterwards.
    const body = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [
          { _key: 's1', _type: 'span', text: 'Bienvenue chez Cogen', marks: [] },
          { _key: 's2', _type: 'span', text: 'ta', marks: ['strong'] },
          { _key: 's3', _type: 'span', text: ', depuis 2024.', marks: [] },
        ],
      },
    ]

    const plan = planEntryReplacement(article, entry({ values: { title: 'x', body } as never }), {
      find: 'Cogenta',
      replace: 'Cogenta SA',
    })

    const written = plan.values?.['body'] as typeof body
    expect(written[0]?.children.map((span) => span.text)).toEqual([
      'Bienvenue chez Cogenta SA',
      '',
      ', depuis 2024.',
    ])
    // Every span keeps its key and its marks: only the text moved.
    expect(written[0]?.children.map((span) => span._key)).toEqual(['s1', 's2', 's3'])
    expect(written[0]?.children[1]?.marks).toEqual(['strong'])
    expect(plan.occurrences).toBe(1)
  })

  it('counts a split occurrence once, and shows the paragraph as a whole in the preview', () => {
    const body = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [
          { _key: 's1', _type: 'span', text: 'Cogen', marks: [] },
          { _key: 's2', _type: 'span', text: 'ta et Cogenta', marks: ['em'] },
        ],
      },
    ]

    const plan = planEntryReplacement(article, entry({ values: { title: 'x', body } as never }), {
      find: 'Cogenta',
      replace: 'Kogenta',
    })

    expect(plan.occurrences).toBe(2)
    const hit = plan.hits.find((candidate) => candidate.path.endsWith('children'))
    expect(hit?.before).toBe('Cogenta et Cogenta')
    expect(hit?.after).toBe('Kogenta et Kogenta')
  })

  it('reaches the text inside blocks, where a page actually lives', () => {
    const plan = planEntryReplacement(
      article,
      entry({
        blocks: {
          body: [
            {
              key: 'h1',
              type: 'hero',
              data: { title: 'Cogenta', eyebrow: 'Nouveau' },
            },
          ],
        } as never,
      }),
      { find: 'Cogenta', replace: 'Kogenta' },
    )

    expect(plan.occurrences).toBe(2)
    expect(plan.hits.some((hit) => hit.path.startsWith('blocks.body'))).toBe(true)
  })

  it('is case-sensitive by default, and says so by finding nothing', () => {
    expect(planEntryReplacement(article, entry(), { find: 'cogenta', replace: 'x' }).hits).toEqual(
      [],
    )
    expect(
      planEntryReplacement(article, entry(), {
        find: 'cogenta',
        replace: 'x',
        caseInsensitive: true,
      }).occurrences,
    ).toBe(1)
  })

  it('can be held to whole words', () => {
    const post = entry({ values: { title: 'art et partisan', slug: 's' } })

    expect(planEntryReplacement(article, post, { find: 'art', replace: 'ART' }).occurrences).toBe(2)
    expect(
      planEntryReplacement(article, post, { find: 'art', replace: 'ART', wholeWord: true })
        .occurrences,
    ).toBe(1)
  })

  it('treats a phrase with regular-expression characters as text', () => {
    const post = entry({ values: { title: 'Prix : 10.00 € (TTC)', slug: 's' } })

    const plan = planEntryReplacement(post ? article : article, post, {
      find: '10.00 € (TTC)',
      replace: '12,00 € TTC',
    })

    expect(plan.values?.['title']).toBe('Prix : 12,00 € TTC')
    // And the dot is a dot, not "any character".
    expect(planEntryReplacement(article, post, { find: '10X00', replace: 'y' }).hits).toEqual([])
  })

  it('returns nothing to write when nothing matches, and refuses an empty search', () => {
    expect(
      planEntryReplacement(article, entry(), { find: 'absent', replace: 'x' }).values,
    ).toBeUndefined()
    expect(planEntryReplacement(article, entry(), { find: '', replace: 'x' }).hits).toEqual([])
  })

  it('names the fields it may touch, and only those', () => {
    expect(replaceableFields(article)).toEqual(['title', 'body'])
  })
})
