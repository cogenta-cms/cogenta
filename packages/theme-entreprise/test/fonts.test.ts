import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * This theme's web fonts are served by the site itself.
 *
 * A font fetched from a provider's server sends every visitor's IP address to
 * that provider before any consent, which a German court held unlawful under
 * the GDPR (LG Munich I, 20 January 2022, 3 O 17493/20). So the faces ship in
 * this package's `fonts/` directory, `src/styles/fonts.css` declares them, and
 * `cogenta serve` answers `/_cogenta/fonts/entreprise/<file>`. These tests keep
 * the three things honest: the stylesheet names no third party, every declared
 * file exists and is what its name says, and French is covered.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FONTS = join(ROOT, 'fonts')
const STYLES = join(ROOT, 'src', 'styles')

const SHEETS = readdirSync(STYLES)
  .filter((name) => extname(name) === '.css')
  .map((name) => ({ name, source: readFileSync(join(STYLES, name), 'utf8') }))
const FONTS_CSS = readFileSync(join(STYLES, 'fonts.css'), 'utf8')
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  files: string[]
  exports: Record<string, unknown>
}

interface ManifestFace {
  family: string
  style: string
  weight: string
  subset: string
  file: string
  css: string
}
const MANIFEST = JSON.parse(readFileSync(join(FONTS, 'manifest.json'), 'utf8')) as {
  theme: string
  faces: ManifestFace[]
}

const RULES = [...FONTS_CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => match[1] ?? '')

/** The code points a `unicode-range` descriptor covers. */
function covers(range: string, codePoint: number): boolean {
  return range
    .split(',')
    .map((part) => part.trim().replace(/^U\+/i, ''))
    .some((part) => {
      const [from, to] = part.split('-').map((hex) => Number.parseInt(hex, 16))
      return codePoint >= (from ?? 0) && codePoint <= (to ?? from ?? 0)
    })
}

describe('self-hosted web fonts', () => {
  it('imports the font declarations from fonts.css and nothing from a remote host', () => {
    const theme = SHEETS.find((sheet) => sheet.name === 'theme.css')?.source ?? ''
    expect(theme).toMatch(/@import\s+"\.\/fonts\.css"\s*;/)
    for (const { name, source } of SHEETS) {
      expect(source, name).not.toMatch(/googleapis|gstatic/i)
      expect(source, name).not.toMatch(/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i)
      expect(source, name).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i)
    }
  })

  it('declares every face with font-display: swap, as WOFF2, from this theme on the site itself', () => {
    expect(RULES.length).toBeGreaterThan(0)
    for (const rule of RULES) {
      expect(rule).toMatch(/font-display:\s*swap\s*;/)
      expect(rule).toMatch(/unicode-range:\s*U\+/)
      expect(rule).toMatch(
        /src:\s*url\(\/_cogenta\/fonts\/entreprise\/[a-z0-9-]+\.woff2\)\s*format\('woff2'\)\s*;/,
      )
    }
  })

  it('declares exactly the faces its manifest lists, and the manifest lists exactly the files', () => {
    expect(MANIFEST.theme).toBe('entreprise')
    for (const face of MANIFEST.faces) expect(FONTS_CSS).toContain(face.css)
    expect(RULES).toHaveLength(MANIFEST.faces.length)
    const onDisk = readdirSync(FONTS)
      .filter((name) => name.endsWith('.woff2'))
      .sort()
    expect(onDisk).toEqual(MANIFEST.faces.map((face) => face.file).sort())
  })

  it('ships real WOFF2 files whose names carry a hash of their bytes', () => {
    for (const face of MANIFEST.faces) {
      const bytes = readFileSync(join(FONTS, face.file))
      expect(bytes.subarray(0, 4).toString('latin1'), face.file).toBe('wOF2')
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8)
      expect(face.file, 'a changed file must change its URL').toContain(`-${hash}.woff2`)
    }
  })

  it('keeps only the Latin and Latin Extended subsets, and the Latin one covers French', () => {
    for (const face of MANIFEST.faces) expect(['latin', 'latin-ext']).toContain(face.subset)
    const latin = RULES.filter((rule) =>
      MANIFEST.faces.some((face) => face.subset === 'latin' && rule.includes(face.file)),
    )
    expect(latin.length).toBeGreaterThan(0)
    for (const rule of latin) {
      const range = /unicode-range:\s*([^;]+);/.exec(rule)?.[1] ?? ''
      // œ Œ ’ « » € — what French text needs beyond ASCII (é è ê à ç are in 00C0-00FF).
      for (const codePoint of [0x0153, 0x0152, 0x2019, 0x00ab, 0x00bb, 0x20ac, 0x00e9, 0x00e7]) {
        expect(covers(range, codePoint), `U+${codePoint.toString(16)} in ${rule}`).toBe(true)
      }
    }
  })

  it('keeps the licence of every family next to the files, and says where they came from', () => {
    const families = new Set(MANIFEST.faces.map((face) => face.family))
    const licences = readdirSync(FONTS).filter((name) => name.startsWith('OFL-'))
    expect(licences).toHaveLength(families.size)
    for (const name of licences) {
      expect(readFileSync(join(FONTS, name), 'utf8'), name).toMatch(/SIL OPEN FONT LICENSE/i)
    }
    const readme = readFileSync(join(FONTS, 'README.md'), 'utf8')
    for (const family of families) expect(readme).toContain(family)
    expect(readme).toMatch(/SIL Open Font License/)
    expect(readme).toMatch(/fetch-theme-fonts/)
  })

  it('publishes the files, and lets the host resolve the manifest', () => {
    expect(PACKAGE.files).toContain('fonts')
    expect(PACKAGE.exports['./fonts/manifest.json']).toBe('./fonts/manifest.json')
    expect(PACKAGE.exports['./fonts/*.woff2']).toBe('./fonts/*.woff2')
  })
})
