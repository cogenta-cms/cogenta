import { describe, expect, it } from 'vitest'

/**
 * The shop screens keep their strings in `locales/<name>.fr.json` /
 * `<name>.en.json` pairs (merged over the main files by `i18n/index.ts`).
 * Each pair must carry exactly the same keys, and no value may be empty.
 */
const FR = import.meta.glob<Record<string, unknown>>('../src/i18n/locales/*.fr.json', {
  eager: true,
  import: 'default',
})
const EN = import.meta.glob<Record<string, unknown>>('../src/i18n/locales/*.en.json', {
  eager: true,
  import: 'default',
})

function collect(node: unknown, prefix: string, into: Map<string, string>): void {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    into.set(prefix, String(node))
    return
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    collect(value, prefix === '' ? key : `${prefix}.${key}`, into)
  }
}

describe('extra locale files', () => {
  it('come in fr/en pairs', () => {
    const frNames = Object.keys(FR).map((path) => path.replace('.fr.json', ''))
    const enNames = Object.keys(EN).map((path) => path.replace('.en.json', ''))
    expect(frNames.sort()).toEqual(enNames.sort())
  })

  for (const path of Object.keys(FR)) {
    const name = path.replace('.fr.json', '')
    it(`${name.split('/').pop()} has the same keys in French and English, none empty`, () => {
      const fr = new Map<string, string>()
      const en = new Map<string, string>()
      collect(FR[path], '', fr)
      collect(EN[`${name}.en.json`], '', en)
      expect([...fr.keys()].filter((key) => !en.has(key)).sort()).toEqual([])
      expect([...en.keys()].filter((key) => !fr.has(key)).sort()).toEqual([])
      expect([...fr].filter(([, value]) => value.trim() === '').map(([key]) => key)).toEqual([])
    })
  }
})
