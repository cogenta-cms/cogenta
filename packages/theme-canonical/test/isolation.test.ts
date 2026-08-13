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

  it('writes no style value the skin cannot change', () => {
    // A literal colour in the stylesheet is a colour no skin can override,
    // which is what would break hot skin switching.
    const css = FILES.find(({ path }) => path.endsWith('theme.css'))
    expect(css).toBeDefined()
    expect(css?.source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css?.source).not.toMatch(/\b(?:rgb|hsl|oklch)a?\(/)
  })
})

describe('the manifest', () => {
  it('implements every block of the vocabulary, in the contract order', () => {
    expect(manifest.implements).toEqual(VOCABULARY_NAMES)
  })

  it('claims the accessibility level the tests actually enforce', () => {
    expect(manifest.a11y.verified).toBe('WCAG-2.2-AA')
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
