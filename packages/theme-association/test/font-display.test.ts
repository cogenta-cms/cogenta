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

  it('declares exactly Bricolage Grotesque and Source Sans 3, from the site itself', () => {
    expect(DECLARED.length).toBeGreaterThan(0)
    expect(FONTS_CSS).not.toMatch(/googleapis|gstatic|@import/i)
    const families = [...new Set(DECLARED.map((face) => face.family))].sort()
    expect(families).toEqual(['Bricolage Grotesque', 'Source Sans 3'])
  })

  it('declares the weights, the italics and the width the stylesheets use', () => {
    const wanted = [
      { family: 'Bricolage Grotesque', style: 'normal', weight: '200 800' },
      { family: 'Source Sans 3', style: 'normal', weight: '200 900' },
      { family: 'Source Sans 3', style: 'italic', weight: '200 900' },
    ]
    for (const face of wanted) {
      expect(DECLARED, `${face.family} ${face.style} ${face.weight}`).toContainEqual(
        expect.objectContaining(face),
      )
    }
    expect(DECLARED.find((face) => face.family === 'Bricolage Grotesque')?.stretch).toBe('75% 100%')
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
