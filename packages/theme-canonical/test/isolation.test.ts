import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VOCABULARY_NAMES } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import manifest from '../theme.config.js'

/**
 * Contract D verifies these at installation, on the theme's sources. Asserting
 * them here as well means a violation fails in this package's own CI, at the
 * commit that introduced it, instead of at someone else's install.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url))

const FORBIDDEN_IMPORTS = [
  'node:fs',
  'node:child_process',
  'node:net',
  'node:http',
  'node:https',
  'node:dgram',
  'node:worker_threads',
  'node:vm',
  'node:process',
  '@cogenta/core',
  '@cogenta/schema',
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return ['.ts', '.astro', '.css'].includes(extname(entry.name)) ? [path] : []
  })
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  source: readFileSync(path, 'utf8'),
}))

describe('theme isolation', () => {
  it('scans the sources it claims to scan', () => {
    expect(FILES.length).toBeGreaterThan(20)
  })

  for (const forbidden of FORBIDDEN_IMPORTS) {
    it(`never imports ${forbidden}`, () => {
      const offenders = FILES.filter(({ source }) =>
        new RegExp(`from\\s+['"]${forbidden.replace('/', '\\/')}`).test(source),
      ).map(({ path }) => path)
      expect(offenders).toEqual([])
    })
  }

  it('never reaches for a secret or an environment variable', () => {
    const offenders = FILES.filter(({ source }) => /process\.env|import\.meta\.env/.test(source))
    expect(offenders.map(({ path }) => path)).toEqual([])
  })

  it('hydrates nothing: no client directive in any component', () => {
    const offenders = FILES.filter(({ source }) =>
      /client:(load|idle|visible|media|only)/.test(source),
    )
    expect(offenders.map(({ path }) => path)).toEqual([])
  })

  /**
   * A literal colour in a stylesheet is a colour no skin can override, which is
   * what would break hot skin switching. The rule is on *every* sheet, not just
   * the entry: splitting `theme.css` into three imports must not open a door
   * the single file did not have.
   *
   * Relative colour syntax is the one exception, and only in its derived form:
   * `oklch(from var(--cogenta-…) …)` reads its hue and chroma from a skin
   * token, so the skin still owns the colour — that is the rule's intent, where
   * a bare `oklch(0.5 0.1 240)` would defeat it. The check below strips the
   * derived form first and then refuses anything that is left.
   */
  const STYLESHEETS = FILES.filter(({ path }) => path.endsWith('.css')).map(({ path, source }) => ({
    path: path.replaceAll('\\', '/'),
    // A comment naming a forbidden function is documentation, not a colour.
    source: source.replace(/\/\*[\s\S]*?\*\//g, ''),
  }))

  it('ships the stylesheets it claims to check', () => {
    expect(STYLESHEETS.map(({ path }) => path).sort()).toEqual([
      'styles/base.css',
      'styles/blocks.css',
      'styles/theme.css',
      'styles/tokens.css',
    ])
  })

  for (const { path, source } of STYLESHEETS) {
    it(`writes no style value the skin cannot change, in ${path}`, () => {
      // `currentColor` covers the `@supports` probe, which needs a syntactically
      // valid relative colour to test for and must not smuggle in a real one.
      const derived = /\boklch\(\s*from\s+(?:var\(--cogenta-[a-z-]+\)|currentColor)[^)]*\)/g
      const remainder = source.replace(derived, '')
      expect(remainder).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(remainder).not.toMatch(/\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(/)
    })
  }
})

describe('the manifest', () => {
  it('implements every block of the vocabulary, in the contract order', () => {
    expect(manifest.implements).toEqual(VOCABULARY_NAMES)
  })

  it('claims the accessibility level the tests actually enforce', () => {
    expect(manifest.a11y?.verified).toBe('WCAG-2.2-AA')
  })

  it('needs nothing from the runtime beyond a static build', () => {
    expect(manifest.runtime).toBe('static')
  })

  it('points at a skin file that exists and parses', () => {
    expect(manifest.tokens).toBe('./tokens.json')
    const raw = readFileSync(new URL('../tokens.json', import.meta.url), 'utf8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})
