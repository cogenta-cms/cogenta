import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { timeOf } from '../src/render/details.js'

const at = (iso: string, locale: string) =>
  timeOf({ iso, date: new Date(iso), hasTime: true }, locale)

describe('French typography', () => {
  it('writes a time with an h and unbreakable spaces, for every French locale', () => {
    expect(at('2026-10-22T18:30:00.000Z', 'fr')).toBe('18 h 30')
    expect(at('2026-10-22T09:05:00.000Z', 'fr-FR')).toBe('9 h 05')
    expect(at('2026-10-22T14:00:00.000Z', 'fr-BE')).toBe('14 h')
  })

  it('leaves the English clock alone', () => {
    expect(at('2026-10-22T18:30:00.000Z', 'en')).toBe('6.30pm')
  })

  it('quotes French text with « guillemets » and an unbreakable space inside', () => {
    const css = readFileSync(new URL('../src/styles/blocks.css', import.meta.url), 'utf8')
    expect(css).toMatch(
      /:lang\(fr\) \.ca-quote__text[^{]*\{[^}]*quotes: "\\00AB\\00A0" "\\00A0\\00BB"/,
    )
  })
})
