import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A web font must never block first paint, and this theme's identity depends
 * on its two families actually arriving: Cormorant Garamond for the house's
 * voice and Karla for everything a guest reads to find their way. One Google
 * Fonts `@import` carries `&display=swap` and both weight axes, upright and
 * italic.
 */

const STYLES = fileURLToPath(new URL('../src/styles', import.meta.url))

const SHEETS = readdirSync(STYLES)
  .filter((name) => extname(name) === '.css')
  .map((name) => ({ name, source: readFileSync(join(STYLES, name), 'utf8') }))

const THEME = SHEETS.find((sheet) => sheet.name === 'theme.css')?.source ?? ''
const CODE = SHEETS.map(({ source }) => source.replace(/\/\*[\s\S]*?\*\//g, '')).join('\n')

describe('web fonts', () => {
  it('never imports a font without font-display: swap', () => {
    const offenders = SHEETS.flatMap(({ name, source }) =>
      [...source.matchAll(/@import\s+url\((["']?)(https:\/\/fonts\.googleapis\.com[^"')]*)\1\)/g)]
        .filter((match) => !(match[2] as string).includes('display=swap'))
        .map((match) => `${name}: ${match[2]}`),
    )
    expect(offenders).toEqual([])
  })

  it('requests exactly two families, in one request', () => {
    expect([...THEME.matchAll(/@import\s+url\(/g)]).toHaveLength(1)
    const families = [...THEME.matchAll(/family=([A-Za-z+0-9]+)/g)].map((match) => match[1])
    expect(families).toEqual(['Cormorant+Garamond', 'Karla'])
  })

  it('asks for the light display weights and the italic of both families', () => {
    expect(THEME).toContain('family=Cormorant+Garamond:ital,wght@0,300..700;1,300..700')
    expect(THEME).toContain('family=Karla:ital,wght@0,200..800;1,200..800')
  })

  it('imports no font file from a stylesheet other than the entry point', () => {
    const offenders = SHEETS.filter(
      ({ name, source }) => name !== 'theme.css' && /@import\s+url\(["']?https:/.test(source),
    ).map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  it('reads both families from the skin: the serif for display, the sans for text', () => {
    expect(CODE).toMatch(/--cr-font-display:\s*var\(--cogenta-font-serif\)/)
    expect(CODE).toMatch(/--cr-font-text:\s*var\(--cogenta-font-sans\)/)
    expect(CODE).toMatch(/body\s*\{[^}]*font-family:\s*var\(--cr-font-text\)/)
  })

  it('sets the monospace face on code alone', () => {
    const uses = [...CODE.matchAll(/([^{}]*)\{[^}]*font-family:\s*var\(--cr-font-code\)/g)].map(
      (match) => (match[1] as string).trim(),
    )
    expect(uses).toEqual([':where(code, kbd, samp, pre)'])
  })

  it('names no typeface in a stylesheet: the families come from the skin alone', () => {
    const withoutImport = CODE.replace(/@import\s+url\([^)]*\);/g, '')
    expect(withoutImport).not.toMatch(/font-family:\s*["']?[A-Z]/)
  })

  it('never lets the browser fake a weight, an italic or small capitals the fonts do not have', () => {
    expect(CODE).toMatch(/body\s*\{[^}]*font-synthesis:\s*none/)
  })
})
