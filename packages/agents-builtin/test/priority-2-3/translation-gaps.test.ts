import { describe, expect, it } from 'vitest'
import { findTranslationGaps, type TranslationFamily } from '../../src/translation/gaps.js'

const family = (overrides: Partial<TranslationFamily> = {}): TranslationFamily => ({
  collection: 'article',
  source: {
    id: 'fr-1',
    locale: 'fr',
    updatedAt: '2026-09-10T10:00:00.000Z',
    title: 'La rentrée du club',
  },
  members: [],
  ...overrides,
})

describe('finding translation gaps', () => {
  it('names a declared locale the family has no entry for', () => {
    const gaps = findTranslationGaps([family()], ['fr', 'en', 'de'])

    expect(gaps.map((gap) => `${gap.issue}:${gap.locale}`)).toEqual(['missing:en', 'missing:de'])
  })

  it('calls a translation stale only when it predates its source', () => {
    const gaps = findTranslationGaps(
      [
        family({
          members: [
            { id: 'en-1', locale: 'en', updatedAt: '2026-09-01T10:00:00.000Z', title: 'Old' },
            { id: 'de-1', locale: 'de', updatedAt: '2026-09-10T10:00:00.000Z', title: 'Same edit' },
          ],
        }),
      ],
      ['fr', 'en', 'de'],
    )

    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ issue: 'stale', locale: 'en' })
  })

  it('never reports the source locale against itself', () => {
    expect(findTranslationGaps([family()], ['fr'])).toEqual([])
  })
})
