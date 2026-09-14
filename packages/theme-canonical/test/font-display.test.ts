import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A web font must never block first paint (audit 2026-09-01,
 * 07-apparence-themes-rendu.md T05), and since L27 this theme's default look
 * depends on its two families actually arriving: Instrument Sans for
 * everything a visitor reads, Instrument Serif for a page's display line and
 * its quotations. One Google Fonts `@import` carries `&display=swap`.
 *
 * The other half (`preconnect` hints for `fonts.googleapis.com` and
 * `fonts.gstatic.com`) lives in `cogenta serve`'s page head: a stylesheet
 * cannot emit a `<link>`.
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

  it('requests exactly the two Instrument families, in one request, before any other import', () => {
    const imports = [...THEME.matchAll(/@import\s+(url\()?["']([^"']+)["']/g)].map((m) => m[2])
    expect(imports[0]).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/)
    expect(imports.filter((url) => url?.startsWith('https:'))).toHaveLength(1)
    const families = [...THEME.matchAll(/family=([A-Za-z+0-9]+)/g)].map((match) => match[1])
    expect(families).toEqual(['Instrument+Sans', 'Instrument+Serif'])
  })

  it('asks for the text face’s weights and italics, and the display face’s italic', () => {
    expect(THEME).toContain('family=Instrument+Sans:ital,wght@0,400..700;1,400..700')
    expect(THEME).toContain('family=Instrument+Serif:ital@0;1')
  })

  it('imports no font file from a stylesheet other than the entry point', () => {
    const offenders = SHEETS.filter(
      ({ name, source }) => name !== 'theme.css' && /@import\s+url\(["']?https:/.test(source),
    ).map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  it('reads its families from the skin alone, so a site’s own skin keeps its own faces', () => {
    expect(CODE).toMatch(/--cg-font-text:\s*var\(--cogenta-font-sans\)/)
    expect(CODE).toMatch(/--cg-font-display:\s*var\(--cogenta-font-serif\)/)
    expect(CODE).toMatch(/--cg-font-mono:\s*var\(--cogenta-font-mono\)/)
    const withoutImport = CODE.replace(/@import\s+url\([^)]*\);/g, '')
    expect(withoutImport).not.toMatch(/font-family:\s*["']?[A-Z]/)
  })
})
