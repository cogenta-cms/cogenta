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

  it('declares exactly Instrument Sans and Instrument Serif, from the site itself', () => {
    expect(DECLARED.length).toBeGreaterThan(0)
    expect(FONTS_CSS).not.toMatch(/googleapis|gstatic|@import/i)
    const families = [...new Set(DECLARED.map((face) => face.family))].sort()
    expect(families).toEqual(['Instrument Sans', 'Instrument Serif'])
  })

  it('declares the weights, the italics and the width the stylesheets use', () => {
    const wanted = [
      { family: 'Instrument Sans', style: 'normal', weight: '400 700' },
      { family: 'Instrument Sans', style: 'italic', weight: '400 700' },
      { family: 'Instrument Serif', style: 'normal', weight: '400' },
      { family: 'Instrument Serif', style: 'italic', weight: '400' },
    ]
    for (const face of wanted) {
      expect(DECLARED, `${face.family} ${face.style} ${face.weight}`).toContainEqual(
        expect.objectContaining(face),
      )
    }
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
