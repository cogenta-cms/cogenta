import { describe, expect, it } from 'vitest'
import { BLOCK_VOCABULARY } from '../../src/blocks/vocabulary.js'
import { BLOCK_CATEGORIES, BLOCK_LIBRARY, searchLibrary } from '../../src/builder/block-library.js'

describe('the insertion panel’s block library (L16 task 4)', () => {
  it('offers every block of the vocabulary, and nothing that is not one', () => {
    expect(BLOCK_LIBRARY.map((entry) => entry.definition.name).sort()).toEqual(
      BLOCK_VOCABULARY.map((definition) => definition.name).sort(),
    )
  })

  it('files every block under a real category', () => {
    // The failure this guards against is a thirteenth block being added to
    // the vocabulary and silently landing nowhere a person would look.
    for (const entry of BLOCK_LIBRARY) {
      expect(BLOCK_CATEGORIES, entry.definition.name).toContain(entry.category)
    }
  })

  it('uses every category it declares', () => {
    const used = new Set(BLOCK_LIBRARY.map((entry) => entry.category))
    for (const category of BLOCK_CATEGORIES) expect([...used]).toContain(category)
  })

  /**
   * The picker translates every label before it searches
   * (`block-picker.tsx`: `blockLabel(entry.definition, t)`), so the library
   * these two pass in is the one a person actually types against. They used
   * to call `searchLibrary` bare and match the French literals that
   * `vocabulary.ts` carried as a fallback — which is to say they tested the
   * fallback and not the thing.
   */
  const localised = (labels: Readonly<Record<string, string>>) =>
    BLOCK_LIBRARY.map((entry) => ({
      ...entry,
      definition: {
        ...entry.definition,
        label: labels[entry.definition.name] ?? entry.definition.label,
      },
    }))

  it('finds a block by its human label, ignoring case and accents', () => {
    const french = localised({ mediaFigure: 'Média et légende' })
    expect(searchLibrary('media', null, french).map((entry) => entry.definition.name)).toContain(
      'mediaFigure',
    )
    expect(searchLibrary('MÉDIA', null, french).map((entry) => entry.definition.name)).toContain(
      'mediaFigure',
    )
  })

  it('finds a block by the type name contract B gives it, in either language', () => {
    // Someone who has read the schema types "collectionList"; an editor types
    // the label their interface shows them. Both are things a person enters.
    expect(searchLibrary('collectionList').map((entry) => entry.definition.name)).toEqual([
      'collectionList',
    ])
    const french = localised({ collectionList: 'Liste de contenus' })
    expect(searchLibrary('liste', null, french).map((entry) => entry.definition.name)).toContain(
      'collectionList',
    )
    expect(searchLibrary('content list').map((entry) => entry.definition.name)).toContain(
      'collectionList',
    )
  })

  it('narrows to one category when one is chosen', () => {
    const media = searchLibrary('', 'media')
    expect(media.map((entry) => entry.definition.name).sort()).toEqual([
      'embed',
      'gallery',
      'logoStrip',
      'logos',
      'mediaFigure',
    ])
  })

  it('combines the query and the category rather than choosing between them', () => {
    expect(searchLibrary('logos', 'text')).toEqual([])
    expect(
      searchLibrary('logos', 'media')
        .map((entry) => entry.definition.name)
        .sort(),
    ).toEqual(['logoStrip', 'logos'])
  })

  it('shows everything for an empty query rather than nothing', () => {
    expect(searchLibrary('   ')).toHaveLength(BLOCK_VOCABULARY.length)
  })

  it('returns an empty list, never a guess, when nothing matches', () => {
    expect(searchLibrary('zzzz')).toEqual([])
  })
})
