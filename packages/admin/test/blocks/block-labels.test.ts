import { describe, expect, it } from 'vitest'
import { BLOCK_VOCABULARY, type ItemFieldDefinition } from '../../src/blocks/vocabulary.js'
import en from '../../src/i18n/locales/en.json'
import fr from '../../src/i18n/locales/fr.json'

/**
 * A block form shows field names and option values as words (L36 audit): an
 * editor working in French saw `eyebrow`, `emphasis` and `primary`. The
 * fallback is the raw name, so a missing label would never fail on its own —
 * this names it instead.
 */

type Shape = { readonly name: string; readonly options: Readonly<Record<string, unknown>> }

function walk(shapes: readonly Shape[], names: Set<string>, values: Set<string>): void {
  for (const shape of shapes) {
    names.add(shape.name)
    const options = shape.options['options']
    if (Array.isArray(options)) {
      for (const choice of options as readonly { value: string }[]) {
        values.add(choice.value.replaceAll(':', 'x'))
      }
    }
    const items = shape.options['items']
    if (Array.isArray(items)) walk(items as readonly ItemFieldDefinition[], names, values)
  }
}

const names = new Set<string>()
const values = new Set<string>()
for (const block of BLOCK_VOCABULARY) walk(block.fields, names, values)

describe('block form labels', () => {
  it.each([
    ['fr', fr],
    ['en', en],
  ] as const)('names every block field and option in %s', (_, locale) => {
    const fields = locale.blockFields as Record<string, string>
    const options = locale.blockOptions as Record<string, string>
    expect([...names].filter((name) => fields[name] === undefined)).toEqual([])
    expect([...values].filter((value) => options[value] === undefined)).toEqual([])
    const types = locale.blockTypes as Record<string, string>
    expect(BLOCK_VOCABULARY.filter((block) => types[block.name] === undefined)).toEqual([])
  })
})
