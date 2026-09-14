import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VOCABULARY_NAMES } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import manifest from '../theme.config.js'

/**
 * Contract D verifies these at installation, on the theme's sources.
 * Asserting them here as well means a violation fails in this package's own
 * CI, at the commit that introduced it, instead of at someone else's install.
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
  path: relative(SRC, path).replaceAll('\\', '/'),
  source: readFileSync(path, 'utf8'),
}))

const STYLESHEETS = FILES.filter(({ path }) => path.endsWith('.css')).map(({ path, source }) => ({
  path,
  source: source.replace(/\/\*[\s\S]*?\*\//g, ''),
}))
const RAW_STYLESHEETS = FILES.filter(({ path }) => path.endsWith('.css'))
const RENDER_SOURCES = FILES.filter(
  ({ path }) => path.startsWith('render/') && path.endsWith('.ts'),
)

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

  it('hydrates nothing: no client directive in any file', () => {
    const offenders = FILES.filter(({ source }) =>
      /client:(load|idle|visible|media|only)/.test(source),
    )
    expect(offenders.map(({ path }) => path)).toEqual([])
  })

  it('never emits a <script> element or an inline handler from a block or the chrome', () => {
    const offenders = RENDER_SOURCES.filter(({ source }) =>
      /<script|['"`]on[a-z]+['"`]\s*:|\son[a-z]+="/i.test(source),
    ).map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('ships the stylesheets it claims to check', () => {
    expect(STYLESHEETS.map(({ path }) => path).sort()).toEqual([
      'styles/archive.css',
      'styles/base.css',
      'styles/blocks.css',
      'styles/theme.css',
      'styles/tokens.css',
      'styles/work.css',
    ])
  })

  /**
   * A literal colour in a stylesheet is a colour no skin can override. The
   * rule is on *every* sheet, not just the entry point. Relative colour
   * syntax is the one exception, and only in its derived form:
   * `oklch(from var(--cogenta-…) …)` still reads its hue and chroma from a
   * skin token.
   */
  for (const { path, source } of STYLESHEETS) {
    it(`writes no style value the skin cannot change, in ${path}`, () => {
      const derived = /\boklch\(\s*from\s+(?:var\(--cogenta-[a-z-]+\)|currentColor)[^)]*\)/g
      const remainder = source.replace(derived, '')
      expect(remainder).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(remainder).not.toMatch(/\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(/)
      expect(remainder).not.toMatch(/:\s*(?:white|black|red|orange|blue|violet|purple)\s*;/)
    })
  }

  it('loads its fonts only from the one host every theme may reach', () => {
    const imports = STYLESHEETS.flatMap(({ source }) =>
      [...source.matchAll(/@import\s+url\(["']([^"']+)["']\)/g)].map((match) => match[1] as string),
    )
    expect(imports).toHaveLength(1)
    for (const url of imports) expect(url.startsWith('https://fonts.googleapis.com/')).toBe(true)
  })

  it('loads every other sheet by a relative import the host inlines, in order', () => {
    const theme = STYLESHEETS.find(({ path }) => path === 'styles/theme.css')?.source ?? ''
    const local = [...theme.matchAll(/@import\s+"([^"]+)";/g)].map((match) => match[1])
    expect(local).toEqual([
      './tokens.css',
      './base.css',
      './work.css',
      './blocks.css',
      './archive.css',
    ])
  })

  /**
   * D5 (`docs/lots/L25-templates-pro.md`) and the L27 studio charter: a
   * gradient, a glow, a scroll-driven entrance are the look of a generated
   * template. This theme is built from flat colour, hairlines and space,
   * locked in here so a later change cannot quietly reintroduce one, in a
   * stylesheet or in an inline style string built by the renderer.
   */
  it('paints no gradient, in a stylesheet or an inline style', () => {
    const offenders = [...RAW_STYLESHEETS, ...RENDER_SOURCES]
      .filter(({ source }) => /gradient\(/.test(source))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('fades nothing in on scroll and declares no keyframes, in a stylesheet or an inline style', () => {
    const offenders = [...RAW_STYLESHEETS, ...RENDER_SOURCES]
      .filter(({ source }) =>
        /animation-timeline|view-timeline|scroll-timeline|@keyframes|animation\s*:/.test(source),
      )
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('fakes no glow, no frosted glass: no blur filter and no backdrop filter', () => {
    const offenders = [...STYLESHEETS, ...RENDER_SOURCES]
      .filter(({ source }) => /blur\(|backdrop-filter/.test(source))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('writes no inline style from a renderer beyond a ratio', () => {
    const styles = RENDER_SOURCES.flatMap(({ source }) =>
      [...source.matchAll(/style:\s*(`[^`]*`|'[^']*')/g)].map((match) => match[1] as string),
    )
    expect(styles.length).toBeGreaterThan(0)
    for (const style of styles) expect(style).toMatch(/--cg-ratio/)
  })

  it('sets no font family literally: the skin names Archivo, the stylesheets read the token', () => {
    const literal = STYLESHEETS.flatMap(({ path, source }) =>
      [...source.matchAll(/font-family:\s*([^;]+);/g)]
        .map((match) => (match[1] as string).trim())
        .filter((value) => !value.startsWith('var(--cg-font'))
        .map((value) => `${path}: ${value}`),
    )
    expect(literal).toEqual([])
  })

  it('never names a typeface generated templates reach for first', () => {
    for (const { path, source } of [...RAW_STYLESHEETS, ...RENDER_SOURCES]) {
      expect(source, path).not.toMatch(
        /\b(Inter|Poppins|Plus Jakarta Sans|Space Grotesk|DM Sans|Manrope|Outfit|Sora|Nunito|Bricolage Grotesque|JetBrains Mono)\b/,
      )
    }
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

  it('names itself distinctly from the reference theme', () => {
    expect(manifest.name).toBe('portfolio')
  })

  it('describes the theme without a word a studio would not use of itself', () => {
    expect(manifest.description).not.toMatch(/ultra|modern|brutalist|electric|stunning|sleek/i)
  })
})
