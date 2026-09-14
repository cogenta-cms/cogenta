import { validateSkin } from '@cogenta/render'
import { describe, expect, it } from 'vitest'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'

/**
 * L22 task 10: "chacun avec un skin de départ cohérent avec le type de
 * site." These are fixed token sets, not AI output, so they must clear the
 * exact same gate a generated skin does (contract D) — the same discipline
 * `skin-validation-corpus.test.ts` holds an AI-produced skin to.
 */
describe('per-blueprint starting skins', () => {
  it('every starting skin passes the real contract-D validation gate', () => {
    for (const [blueprintId, tokens] of Object.entries(STARTING_SKINS)) {
      expect(() => validateSkin(tokens), blueprintId).not.toThrow()
    }
  })

  it('offers one for each site type that has claimed a starting skin so far', () => {
    expect(Object.keys(STARTING_SKINS).sort()).toEqual([
      'association',
      'blog',
      'documentation',
      'magazine',
      'portfolio',
      'restaurant',
      'saas',
      'store',
      'vitrine',
    ])
  })

  it('gives each starting skin a distinct accent colour, not three copies of one palette', () => {
    const accents = new Set(Object.values(STARTING_SKINS).map((tokens) => tokens.color.accent))
    expect(accents.size).toBe(Object.keys(STARTING_SKINS).length)
  })
})
