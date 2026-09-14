import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A web font must never block first paint, and this theme's identity depends
 * on its two families actually arriving: Bricolage Grotesque for what a
 * visitor reads first, Source Sans 3 for everything they read to act. One
 * Google Fonts `@import` carries `&display=swap` and the axes the stylesheet
 * uses (optical size and width for Bricolage).
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

  it('requests exactly two families, Bricolage Grotesque and Source Sans 3, in one request', () => {
    expect([...THEME.matchAll(/@import\s+url\(/g)]).toHaveLength(1)
    const families = [...THEME.matchAll(/family=([A-Za-z+0-9]+)/g)].map((match) => match[1])
    expect(families).toEqual(['Bricolage+Grotesque', 'Source+Sans+3'])
  })

  it('asks for the optical size, width and weight axes the display face is set with', () => {
    expect(THEME).toContain('family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800')
    expect(THEME).toContain('family=Source+Sans+3:ital,wght@0,200..900;1,200..900')
  })

  it('narrows the display face only within the width axis it actually has', () => {
    const stretches = [...CODE.matchAll(/--ca-stretch-[a-z]+:\s*(\d+)%/g)].map((m) => Number(m[1]))
    expect(stretches.length).toBeGreaterThanOrEqual(2)
    for (const value of stretches) {
      expect(value).toBeGreaterThanOrEqual(75)
      expect(value).toBeLessThanOrEqual(100)
    }
  })

  it('imports no font file from a stylesheet other than the entry point', () => {
    const offenders = SHEETS.filter(
      ({ name, source }) => name !== 'theme.css' && /@import\s+url\(["']?https:/.test(source),
    ).map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  it('reads both families from the skin: the serif slot as display, the sans for text', () => {
    expect(CODE).toMatch(/--ca-font-display:\s*var\(--cogenta-font-serif\)/)
    expect(CODE).toMatch(/--ca-font-text:\s*var\(--cogenta-font-sans\)/)
    expect(CODE).toMatch(/body\s*\{[^}]*font-family:\s*var\(--ca-font-text\)/)
  })

  it('names no typeface in a stylesheet: the families come from the skin alone', () => {
    const withoutImport = CODE.replace(/@import\s+url\([^)]*\);/g, '')
    expect(withoutImport).not.toMatch(/font-family:\s*["']?[A-Z]/)
  })

  it('never lets the browser fake a weight, an italic or small capitals the fonts do not have', () => {
    expect(CODE).toMatch(/body\s*\{[^}]*font-synthesis:\s*none/)
    expect(CODE).not.toMatch(/font-variant-caps/)
  })
})
