import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VOCABULARY_NAMES } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import manifest from '../theme.config.js'

/**
 * Contract D verifies these at installation, on the theme's sources.
 * Asserting them here as well means a violation fails in this package's own
 * CI, at the commit that introduced it, instead of at someone else's
 * install.
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

const STYLESHEET_SOURCES = FILES.filter(({ path }) => path.endsWith('.css')).map(
  ({ path, source }) => ({ path: path.replaceAll('\\', '/'), source }),
)

describe('theme isolation', () => {
  it('scans the sources it claims to scan', () => {
    expect(FILES.length).toBeGreaterThan(15)
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

  it('emits no <script> tag in any source file', () => {
    // Comments are allowed to *talk about* `<script>` (this file's own
    // JSDoc does, and so does `embed.ts`'s, explaining why it never emits
    // one) — only a literal tag in actual output would defeat the theme's
    // zero-client-JS guarantee, so block comments are stripped first.
    const offenders = FILES.filter(({ source }) =>
      /<script/i.test(source.replace(/\/\*[\s\S]*?\*\//g, '')),
    ).map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  /**
   * A literal colour in a stylesheet is a colour no skin can override.
   * Relative colour syntax is the one exception, and only in its derived
   * form: `oklch(from var(--cogenta-…) …)` reads its hue and chroma from a
   * skin token, so the skin still owns the colour.
   */
  const STYLESHEETS = FILES.filter(({ path }) => path.endsWith('.css')).map(({ path, source }) => ({
    path: path.replaceAll('\\', '/'),
    source: source.replace(/\/\*[\s\S]*?\*\//g, ''),
  }))

  it('ships the stylesheets it claims to check', () => {
    expect(STYLESHEETS.map(({ path }) => path).sort()).toEqual([
      'styles/archive.css',
      'styles/base.css',
      'styles/blocks.css',
      'styles/theme.css',
      'styles/tokens.css',
    ])
  })

  for (const { path, source } of STYLESHEETS) {
    it(`writes no style value the skin cannot change, in ${path}`, () => {
      const derived = /\boklch\(\s*from\s+(?:var\(--cogenta-[a-z-]+\)|currentColor)[^)]*\)/g
      const remainder = source.replace(derived, '')
      expect(remainder).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(remainder).not.toMatch(/\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(/)
    })
  }

  /**
   * D5 (`docs/lots/L25-templates-pro.md`): a gradient reads as the generic
   * "AI-generated" look. This theme is built entirely from flat colour
   * fields, hairlines and shadows instead — locked in here so a later
   * change cannot quietly reintroduce one, in a stylesheet or in an inline
   * style string built by the renderer.
   */
  const RAW_STYLESHEETS = FILES.filter(({ path }) => path.endsWith('.css')).map(
    ({ path, source }) => ({
      path: path.replaceAll('\\', '/'),
      source,
    }),
  )
  const RENDER_SOURCES = FILES.filter(
    ({ path }) => path.replaceAll('\\', '/').startsWith('render/') && path.endsWith('.ts'),
  )

  it('paints no gradient, in a stylesheet or an inline style', () => {
    const offenders = [...RAW_STYLESHEETS, ...RENDER_SOURCES]
      .filter(({ source }) => /gradient\(/.test(source))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('fakes no glow with a decorative blur filter', () => {
    // A blur serving a real accessibility purpose would be exempt if the
    // same line carried a `/* a11y */` comment; none of this theme's
    // surfaces need one.
    const offenders = [...RAW_STYLESHEETS, ...RENDER_SOURCES].flatMap(({ path, source }) =>
      source
        .split('\n')
        .some(
          (line) =>
            /(?:filter|backdrop-filter)\s*:\s*[^;]*\bblur\(/.test(line) &&
            !line.includes('/* a11y */'),
        )
        ? [path]
        : [],
    )
    expect(offenders).toEqual([])
  })

  it('requests its Google Fonts import from the trusted host only', () => {
    const theme = STYLESHEET_SOURCES.find(({ path }) => path === 'styles/theme.css')
    expect(theme).toBeDefined()
    const urls = [...(theme?.source.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/g) ?? [])].map(
      (match) => match[1] as string,
    )
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url.startsWith('https://fonts.googleapis.com/')).toBe(true)
  })
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
