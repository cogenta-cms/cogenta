import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A web font must never block first paint. Every Google Fonts `@import` in
 * this theme carries `&display=swap`; this test is the guard that keeps it
 * that way, because the failure mode is silent — a font added without it
 * renders invisible text for as long as the download takes, and nothing in
 * a build or a type check would say so.
 */

const STYLES = fileURLToPath(new URL('../src/styles', import.meta.url))

const SHEETS = readdirSync(STYLES)
  .filter((name) => extname(name) === '.css')
  .map((name) => ({ name, source: readFileSync(join(STYLES, name), 'utf8') }))

describe('web fonts', () => {
  it('never imports a font without font-display: swap', () => {
    const offenders = SHEETS.flatMap(({ name, source }) =>
      [...source.matchAll(/@import\s+url\((["']?)(https:\/\/fonts\.googleapis\.com[^"')]*)\1\)/g)]
        .filter((match) => !(match[2] as string).includes('display=swap'))
        .map((match) => `${name}: ${match[2]}`),
    )
    expect(offenders).toEqual([])
  })

  it('requests the two families this theme names — Nunito and Source Sans 3', () => {
    const theme = SHEETS.find(({ name }) => name === 'theme.css')
    expect(theme).toBeDefined()
    expect(theme?.source).toContain('family=Nunito')
    expect(theme?.source).toContain('family=Source+Sans+3')
  })
})
