import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A web font must never block first paint. Every Google Fonts `@import` in
 * this theme carries `&display=swap`; this test is the guard that keeps it
 * that way — the failure mode is silent, since a font added without it
 * renders invisible text for as long as the download takes.
 */

const STYLES = fileURLToPath(new URL('../src/styles', import.meta.url))

const SHEETS = readdirSync(STYLES)
  .filter((name) => extname(name) === '.css' && name !== 'fonts.css')
  .map((name) => ({ name, source: readFileSync(join(STYLES, name), 'utf8') }))

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

  it('declares exactly Sofia Sans Condensed, Hanken Grotesk and Geist Mono, from the site itself', () => {
    expect(DECLARED.length).toBeGreaterThan(0)
    expect(FONTS_CSS).not.toMatch(/googleapis|gstatic|@import/i)
    const families = [...new Set(DECLARED.map((face) => face.family))].sort()
    expect(families).toEqual(['Geist Mono', 'Hanken Grotesk', 'Sofia Sans Condensed'])
  })

  it('declares the weights, the italics and the width the stylesheets use', () => {
    const wanted = [
      { family: 'Sofia Sans Condensed', style: 'normal', weight: '500 900' },
      { family: 'Hanken Grotesk', style: 'normal', weight: '400 700' },
      { family: 'Hanken Grotesk', style: 'italic', weight: '400 700' },
      { family: 'Geist Mono', style: 'normal', weight: '400 600' },
    ]
    for (const face of wanted) {
      expect(DECLARED, `${face.family} ${face.style} ${face.weight}`).toContainEqual(
        expect.objectContaining(face),
      )
    }
  })

  it('ships the whole family set in under 300 KiB, and loads only the Latin faces for French', async () => {
    const { readdirSync, statSync } = await import('node:fs')
    const dir = fileURLToPath(new URL('../fonts', import.meta.url))
    const files = readdirSync(dir).filter((name) => name.endsWith('.woff2'))
    const total = files.reduce((sum, name) => sum + statSync(join(dir, name)).size, 0)
    expect(total).toBeLessThan(300 * 1024)
    const latin = files.filter((name) => !name.includes('-latin-ext-'))
    const latinTotal = latin.reduce((sum, name) => sum + statSync(join(dir, name)).size, 0)
    expect(latinTotal).toBeLessThan(150 * 1024)
  })

  it('imports no font file from a stylesheet other than the entry point', () => {
    const offenders = SHEETS.filter(
      ({ name, source }) => name !== 'theme.css' && /@import\s+url\(["']?https:/.test(source),
    ).map(({ name }) => name)
    expect(offenders).toEqual([])
  })
})
