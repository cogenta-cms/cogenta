import { describe, expect, it } from 'vitest'
import { BLOCK_VOCABULARY } from '../src/blocks/vocabulary.js'
import en from '../src/i18n/locales/en.json'

/**
 * English is the language a missing key falls back to, and the one an admin
 * opens in when the browser asks for neither French nor English.
 *
 * It used to be French, for a reason that had expired: French was the only
 * language the interface had, so falling back to it could surprise nobody.
 * With two, an English admin met French words in exactly the place a fallback
 * is guaranteed to be read — wherever a key was missing.
 */
describe('the language behind everything else', () => {
  it('never falls back to a French word for a block type', () => {
    // These literals are the `defaultValue` of `t('blockTypes.<name>')`: what
    // shows if that key ever goes missing. They were French.
    const french = /[éèàçêôûùî]/u
    for (const block of BLOCK_VOCABULARY) {
      expect(french.test(block.label), `${block.name}: ${block.label}`).toBe(false)
    }
  })

  it('has an English string for every block type the vocabulary ships', () => {
    const blockTypes = en.blockTypes as Record<string, string | undefined>
    for (const block of BLOCK_VOCABULARY) {
      expect(blockTypes[block.name], block.name).toBeDefined()
    }
  })
})
