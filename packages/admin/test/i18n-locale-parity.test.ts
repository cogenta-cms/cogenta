import { describe, expect, it } from 'vitest'
import en from '../src/i18n/locales/en.json'
import fr from '../src/i18n/locales/fr.json'

/**
 * Every translatable string must exist in both locales — a key present in
 * one and missing in the other means either an untranslated English
 * fallback leaking into the French UI, or dead French text nobody can
 * reach. This walks both trees recursively and reports the exact missing
 * paths, so a future regression names the key instead of failing silently.
 */
function collectKeyPaths(node: unknown, prefix: string, into: Set<string>): void {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    into.add(prefix)
    return
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    collectKeyPaths(value, path, into)
  }
}

describe('locale key parity', () => {
  it('has the exact same set of keys in fr.json and en.json', () => {
    const frKeys = new Set<string>()
    const enKeys = new Set<string>()
    collectKeyPaths(fr, '', frKeys)
    collectKeyPaths(en, '', enKeys)

    const missingInFr = [...enKeys].filter((key) => !frKeys.has(key)).sort()
    const missingInEn = [...frKeys].filter((key) => !enKeys.has(key)).sort()

    expect(missingInFr, `keys missing in fr.json: ${missingInFr.join(', ')}`).toEqual([])
    expect(missingInEn, `keys missing in en.json: ${missingInEn.join(', ')}`).toEqual([])
  })
})
