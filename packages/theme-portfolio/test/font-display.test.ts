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

  it('requests exactly one family, Archivo, in one request', () => {
    expect([...THEME.matchAll(/@import\s+url\(/g)]).toHaveLength(1)
    const families = [...THEME.matchAll(/family=([A-Za-z+0-9]+)/g)].map((match) => match[1])
    expect(families).toEqual(['Archivo'])
  })

  it('asks for the whole width axis and the whole weight axis', () => {
    expect(THEME).toContain('family=Archivo:wdth,wght@62..125,100..900')
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
