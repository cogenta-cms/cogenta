import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A web font must never block first paint, and this theme's identity depends
 * on its two families actually arriving: Geist for everything a visitor reads,
 * Geist Mono for what software prints. One Google Fonts `@import` carries
 * `&display=swap` and both weight axes.
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
    expect(families).toEqual(['Geist', 'Geist+Mono'])
  })

  it('asks for the whole weight axis of both families', () => {
    expect(THEME).toContain('family=Geist:wght@100..900')
    expect(THEME).toContain('family=Geist+Mono:wght@100..900')
  })

  it('imports no font file from a stylesheet other than the entry point', () => {
    const offenders = SHEETS.filter(
      ({ name, source }) => name !== 'theme.css' && /@import\s+url\(["']?https:/.test(source),
    ).map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  it('reads both families from the skin: the sans for text, the mono for what software prints', () => {
    expect(CODE).toMatch(/--cs-font-sans:\s*var\(--cogenta-font-sans\)/)
    expect(CODE).toMatch(/--cs-font-mono:\s*var\(--cogenta-font-mono\)/)
    expect(CODE).toMatch(/body\s*\{[^}]*font-family:\s*var\(--cs-font-sans\)/)
  })

  it('never reaches for the skin’s serif: this theme sets no serif at all', () => {
    expect(CODE).not.toMatch(/--cogenta-font-serif/)
  })

  it('names no typeface in a stylesheet: the families come from the skin alone', () => {
    const withoutImport = CODE.replace(/@import\s+url\([^)]*\);/g, '')
    expect(withoutImport).not.toMatch(/font-family:\s*["']?[A-Z]/)
  })

  it('never lets the browser fake a weight or an italic the fonts do not have', () => {
    expect(CODE).toMatch(/body\s*\{[^}]*font-synthesis:\s*none/)
  })
})
