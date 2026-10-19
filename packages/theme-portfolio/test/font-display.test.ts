import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A web font must never block first paint, and this theme's identity depends
 * on Archivo actually arriving with its width axis. The one Google Fonts
 * `@import` carries `&display=swap` and both axes; this test keeps it so.
 */

const STYLES = fileURLToPath(new URL('../src/styles', import.meta.url))

const SHEETS = readdirSync(STYLES)
  .filter((name) => extname(name) === '.css' && name !== 'fonts.css')
  .map((name) => ({ name, source: readFileSync(join(STYLES, name), 'utf8') }))

const THEME = SHEETS.find((sheet) => sheet.name === 'theme.css')?.source ?? ''
const CODE = SHEETS.map(({ source }) => source.replace(/\/\*[\s\S]*?\*\//g, '')).join('\n')

const FONTS_CSS = readFileSync(join(STYLES, 'fonts.css'), 'utf8')

/** Every `@font-face` this theme declares, as family / style / weight (and stretch, when it has one). */
const DECLARED = [...FONTS_CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => {
  const body = match[1] ?? ''
  const field = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim()
  return {
    family: field('font-family')?.replaceAll("'", ''),
    style: field('font-style'),
    weight: field('font-weight'),
    stretch: field('font-stretch'),
  }
})

describe('web fonts', () => {
  it('never imports a font without font-display: swap', () => {
    const offenders = SHEETS.flatMap(({ name, source }) =>
      [...source.matchAll(/@import\s+url\((["']?)(https:\/\/fonts\.googleapis\.com[^"')]*)\1\)/g)]
        .filter((match) => !(match[2] as string).includes('display=swap'))
        .map((match) => `${name}: ${match[2]}`),
    )
    expect(offenders).toEqual([])
  })

  it('declares exactly Archivo, from the site itself', () => {
    expect(DECLARED.length).toBeGreaterThan(0)
    expect(FONTS_CSS).not.toMatch(/googleapis|gstatic|@import/i)
    const families = [...new Set(DECLARED.map((face) => face.family))].sort()
    expect(families).toEqual(['Archivo'])
  })

  it('declares the weights, the italics and the width the stylesheets use', () => {
    const wanted = [{ family: 'Archivo', style: 'normal', weight: '100 900' }]
    for (const face of wanted) {
      expect(DECLARED, `${face.family} ${face.style} ${face.weight}`).toContainEqual(
        expect.objectContaining(face),
      )
    }
    expect(DECLARED.find((face) => face.family === 'Archivo')?.stretch).toBe('62% 125%')
  })

  it('imports no font file from a stylesheet other than the entry point', () => {
    const offenders = SHEETS.filter(
      ({ name, source }) => name !== 'theme.css' && /@import\s+url\(["']?https:/.test(source),
    ).map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  it('uses the width axis through font-stretch, set wider than the text for display', () => {
    expect(CODE).toMatch(/--cg-width-text:\s*100%/)
    expect(CODE).toMatch(/--cg-width-display:\s*112%/)
    expect(CODE).toMatch(/body\s*\{[^}]*font-stretch:\s*var\(--cg-width-text\)/)
    for (const selector of [
      '.cg-statement__title {',
      '.cg-page-head__title {',
      '.cg-project-head__title {',
      '.cg-archive__title {',
    ]) {
      const at = CODE.indexOf(selector)
      expect(at, selector).toBeGreaterThan(-1)
      expect(CODE.slice(at, CODE.indexOf('}', at)), selector).toMatch(
        /font-stretch:\s*var\(--cg-width-display\)/,
      )
    }
  })

  it('sets the monospace face on code alone: no code-style labels or numbering', () => {
    const uses = [...CODE.matchAll(/([^{}]*)\{[^}]*font-family:\s*var\(--cg-font-code\)/g)].map(
      (match) => (match[1] as string).trim(),
    )
    expect(uses).toEqual([':where(code, kbd, samp, pre)'])
  })
})
