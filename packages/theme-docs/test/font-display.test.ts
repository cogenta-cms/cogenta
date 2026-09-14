import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A web font must never block first paint, and this theme's identity depends
 * on its two families actually arriving: IBM Plex Sans for everything a reader
 * reads, IBM Plex Mono for code. One Google Fonts `@import` carries
 * `&display=swap`; `cogenta serve` hoists it above the skin's rules.
 */

const STYLES = fileURLToPath(new URL('../src/styles', import.meta.url))

const SHEETS = readdirSync(STYLES)
  .filter((name) => extname(name) === '.css')
  .map((name) => ({ name, source: readFileSync(join(STYLES, name), 'utf8') }))

const THEME = SHEETS.find((sheet) => sheet.name === 'theme.css')?.source ?? ''
const CODE = SHEETS.map(({ source }) => source.replace(/\/\*[\s\S]*?\*\//g, '')).join('\n')

/** Families the studio charter forbids: the signatures of generated templates. */
const FORBIDDEN_FAMILIES = [
  'Inter',
  'Poppins',
  'Plus Jakarta Sans',
  'Space Grotesk',
  'DM Sans',
  'Manrope',
  'Outfit',
  'Sora',
  'Nunito',
] as const

describe('web fonts', () => {
  it('never imports a font without font-display: swap', () => {
    const offenders = SHEETS.flatMap(({ name, source }) =>
      [...source.matchAll(/@import\s+url\((["']?)(https:\/\/fonts\.googleapis\.com[^"')]*)\1\)/g)]
        .filter((match) => !(match[2] as string).includes('display=swap'))
        .map((match) => `${name}: ${match[2]}`),
    )
    expect(offenders).toEqual([])
  })

  it('requests exactly the two Plex families, in one request', () => {
    expect([...THEME.matchAll(/@import\s+url\(/g)]).toHaveLength(1)
    const families = [...THEME.matchAll(/family=([A-Za-z+0-9]+)/g)].map((match) => match[1])
    expect(families).toEqual(['IBM+Plex+Sans', 'IBM+Plex+Mono'])
  })

  it('asks for the weights and the italics the stylesheets use', () => {
    expect(THEME).toContain('family=IBM+Plex+Sans:ital,wght@0,100..700;1,100..700')
    expect(THEME).toContain('family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400')
  })

  it('imports no font file from a stylesheet other than the entry point', () => {
    const offenders = SHEETS.filter(
      ({ name, source }) => name !== 'theme.css' && /@import\s+url\(["']?https:/.test(source),
    ).map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  it('reads both families from the skin: the sans for text, the mono for code', () => {
    expect(CODE).toMatch(/--cd-font-sans:\s*var\(--cogenta-font-sans\)/)
    expect(CODE).toMatch(/--cd-font-mono:\s*var\(--cogenta-font-mono\)/)
    expect(CODE).toMatch(/body\s*\{[^}]*font-family:\s*var\(--cd-font-sans\)/)
  })

  it('never reaches for the skin’s serif: this theme sets no serif at all', () => {
    expect(CODE).not.toMatch(/--cogenta-font-serif/)
  })

  it('names no typeface in a stylesheet: the families come from the skin alone', () => {
    const withoutImport = CODE.replace(/@import\s+url\([^)]*\);/g, '')
    expect(withoutImport).not.toMatch(/font-family:\s*["']?[A-Z]/)
  })

  it('never uses a family reserved as a signature of generated templates', () => {
    const skin = readFileSync(new URL('../tokens.json', import.meta.url), 'utf8')
    for (const family of FORBIDDEN_FAMILIES) {
      expect(skin, family).not.toMatch(new RegExp(`['"]${family}['"]`))
      expect(THEME, family).not.toContain(`family=${family.replaceAll(' ', '+')}:`)
    }
  })

  it('never lets the browser fake a weight or an italic the fonts do not have', () => {
    expect(CODE).toMatch(/body\s*\{[^}]*font-synthesis:\s*none/)
  })
})
