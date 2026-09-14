import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A web font must never block first paint, and this theme's identity depends
 * on three families actually arriving. Every Google Fonts `@import` carries
 * `&display=swap`; this test keeps it that way, since a font added without it
 * renders invisible text for as long as the download takes.
 */

const STYLES = fileURLToPath(new URL('../src/styles', import.meta.url))

const SHEETS = readdirSync(STYLES)
  .filter((name) => extname(name) === '.css')
  .map((name) => ({ name, source: readFileSync(join(STYLES, name), 'utf8') }))

const THEME = SHEETS.find((sheet) => sheet.name === 'theme.css')?.source ?? ''

describe('web fonts', () => {
  it('never imports a font without font-display: swap', () => {
    const offenders = SHEETS.flatMap(({ name, source }) =>
      [...source.matchAll(/@import\s+url\((["']?)(https:\/\/fonts\.googleapis\.com[^"')]*)\1\)/g)]
        .filter((match) => !(match[2] as string).includes('display=swap'))
        .map((match) => `${name}: ${match[2]}`),
    )
    expect(offenders).toEqual([])
  })

  it("requests exactly this theme's three families, in one request", () => {
    expect([...THEME.matchAll(/@import\s+url\(/g)]).toHaveLength(1)
    const families = [...THEME.matchAll(/family=([A-Za-z+0-9]+)/g)].map((match) => match[1])
    expect(families.sort()).toEqual(['Fraunces', 'Libre+Franklin', 'Source+Serif+4'])
  })

  it("asks for Fraunces's whole optical-size axis, and no Fraunces italic", () => {
    expect(THEME).toMatch(/family=Fraunces:opsz,wght@9\.\.144,/)
    expect(THEME).not.toMatch(/family=Fraunces:ital/)
  })

  it('asks for Source Serif 4 with its optical sizes and its italic, which standfirsts use', () => {
    expect(THEME).toMatch(/family=Source\+Serif\+4:ital,opsz,wght@0,8\.\.60,[^;&]*;1,8\.\.60,/)
  })

  it('imports no font file from a stylesheet other than the entry point', () => {
    const offenders = SHEETS.filter(
      ({ name, source }) => name !== 'theme.css' && /@import\s+url\(["']?https:/.test(source),
    ).map(({ name }) => name)
    expect(offenders).toEqual([])
  })
})
