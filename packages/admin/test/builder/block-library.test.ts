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

  it('finds a block by its human label, ignoring case and accents', () => {
    const found = searchLibrary('media')
    expect(found.map((entry) => entry.definition.name)).toContain('mediaFigure')
    expect(searchLibrary('MÉDIA').map((entry) => entry.definition.name)).toContain('mediaFigure')
  })

  it('finds a block by the type name contract B gives it', () => {
    // Someone who has read the schema types "collectionList"; an editor types
    // "liste". Both are things a person actually enters.
    expect(searchLibrary('collectionList').map((entry) => entry.definition.name)).toEqual([
      'collectionList',
    ])
    expect(searchLibrary('liste').map((entry) => entry.definition.name)).toContain('collectionList')
  })

  it('narrows to one category when one is chosen', () => {
    const media = searchLibrary('', 'media')
    expect(media.map((entry) => entry.definition.name).sort()).toEqual([
      'embed',
      'gallery',
      'logos',
      'mediaFigure',
    ])
  })

  it('combines the query and the category rather than choosing between them', () => {
    expect(searchLibrary('logos', 'text')).toEqual([])
    expect(searchLibrary('logos', 'media').map((entry) => entry.definition.name)).toEqual(['logos'])
  })

  it('shows everything for an empty query rather than nothing', () => {
    expect(searchLibrary('   ')).toHaveLength(BLOCK_VOCABULARY.length)
  })

  it('returns an empty list, never a guess, when nothing matches', () => {
    expect(searchLibrary('zzzz')).toEqual([])
  })
})
