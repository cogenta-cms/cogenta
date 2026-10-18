import { createInstance, type TFunction } from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_TOOLS, toolDescription, toolLabel } from '../../src/assist/tool-text.js'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import fr from '../../src/i18n/locales/fr.json' with { type: 'json' }

let tFr: TFunction
let tEn: TFunction

beforeAll(async () => {
  const french = createInstance()
  await french.init({ lng: 'fr', resources: { fr: { translation: fr } } })
  tFr = french.t
  const english = createInstance()
  await english.init({ lng: 'en', resources: { en: { translation: en } } })
  tEn = english.t
})

/**
 * The selection assistant of the rich-text editor showed "Rewrite",
 * "Proofread", "Summarise" — the server's English labels — in a French admin,
 * beside an entry panel that already said "Réécrire".
 */
describe('the words an assistant tool is shown with', () => {
  it('names a built-in tool in the admin’s language, whatever the server sent', () => {
    const tool = { tool: 'assist.rewrite', label: 'Rewrite', description: 'Rewrite a passage.' }

    expect(toolLabel(tool, tFr)).toBe('Réécrire')
    expect(toolDescription(tool, tFr)).not.toBe('Rewrite a passage.')
  })

  it('keeps the words a third party wrote for its own tool', () => {
    const tool = { tool: 'acme.summarise', label: 'Acme summary', description: 'By Acme.' }

    expect(toolLabel(tool, tFr)).toBe('Acme summary')
    expect(toolDescription(tool, tFr)).toBe('By Acme.')
  })

  it('has a label and a description for every built-in tool in both languages', () => {
    for (const id of BUILTIN_TOOLS) {
      const tool = { tool: id, label: '', description: '' }
      for (const t of [tFr, tEn]) {
        expect(toolLabel(tool, t), id).not.toMatch(/^assistant\.|^$/u)
        expect(toolDescription(tool, t), id).not.toMatch(/^assistant\.|^$/u)
      }
    }
  })
})
