import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { primaryFamily, renderSkin } from '@cogenta/render'

/**
 * The web fonts of the built-in themes, served by the site itself.
 *
 * A font loaded from a provider's server sends every visitor's IP address to
 * that provider before any consent — a practice a German court held unlawful
 * under the GDPR (LG Munich I, 20 January 2022, 3 O 17493/20), and Cogenta's
 * audience is largely European. So the ten themes ship their faces as WOFF2
 * files in their own package (`<theme>/fonts/`), declare them with `@font-face`
 * in `src/styles/fonts.css`, and `cogenta serve` answers
 * `/_cogenta/fonts/<theme>/<file>` from those directories. No request to a font
 * provider is made unless the site owner turns on `appearance.remoteWebFonts`.
 *
 * Two jobs live here, both reading the same `fonts/manifest.json` each theme
 * package commits next to its files:
 *
 *  1. **the route** — `serveThemeFont`. The manifest *is* the allow-list: a
 *     file is served only if the theme's manifest names it, and the path
 *     segments are held to a strict shape first, so there is no filesystem
 *     path a request can name that is not a font the theme shipped.
 *  2. **skins** — a skin may name any bundled family on any theme (Geist on
 *     the restaurant theme). `bundledFaceRules` finds the `@font-face` rules
 *     for such a family in whichever theme carries it, so the choice renders
 *     instead of silently falling back to a system face.
 */

export const FONT_ROUTE_PREFIX = '/_cogenta/fonts/'

const THEME_PACKAGE_PREFIX = '@cogenta/theme-'

/** The built-in theme short names, mirrored from `BUILTIN_THEMES` by a test. */
export const BUNDLED_FONT_THEMES: readonly string[] = [
  'association',
  'blog',
  'canonical',
  'docs',
  'ecommerce',
  'entreprise',
  'magazine',
  'portfolio',
  'restaurant',
  'saas',
]

interface ManifestFace {
  readonly family: string
  readonly style: string
  readonly weight: string
  readonly subset: string
  readonly file: string
  readonly css: string
}

interface ThemeFontManifest {
  readonly theme: string
  readonly faces: readonly ManifestFace[]
}

interface LoadedThemeFonts {
  readonly dir: string
  readonly manifest: ThemeFontManifest
  readonly files: ReadonlySet<string>
}

const loaded = new Map<string, LoadedThemeFonts | null>()

/** A theme's fonts, or `null` for a theme that ships none (or is not a built-in). Memoised: the files only change with a package update. */
function themeFonts(theme: string): LoadedThemeFonts | null {
  if (!BUNDLED_FONT_THEMES.includes(theme)) return null
  const cached = loaded.get(theme)
  if (cached !== undefined) return cached
  let result: LoadedThemeFonts | null = null
  try {
    const manifestPath = fileURLToPath(
      import.meta.resolve(`${THEME_PACKAGE_PREFIX}${theme}/fonts/manifest.json`),
    )
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ThemeFontManifest
    result = {
      dir: dirname(manifestPath),
      manifest,
      files: new Set(manifest.faces.map((face) => face.file)),
    }
  } catch {
    result = null
  }
  loaded.set(theme, result)
  return result
}

/** The shape of a theme segment and of a font file name, checked before anything touches the filesystem. */
const THEME_SEGMENT = /^[a-z][a-z0-9-]{0,40}$/u
const FILE_SEGMENT = /^[a-z0-9][a-z0-9-]{0,100}\.woff2$/u

export interface ThemeFontAsset {
  readonly body: Buffer
  readonly contentType: 'font/woff2'
  readonly cacheControl: string
}

/**
 * Answers `/_cogenta/fonts/<theme>/<file>.woff2`, or `null` when the path is
 * not a font a built-in theme ships.
 *
 * The file name carries a hash of the file's bytes (`scripts/fetch-theme-fonts
 * .mjs`), so the URL changes whenever the file does and a year-long
 * `immutable` cache can never serve a stale face. There is no CORS header: the
 * font is requested by the site's own stylesheet, same origin.
 */
export async function serveThemeFont(pathname: string): Promise<ThemeFontAsset | null> {
  if (!pathname.startsWith(FONT_ROUTE_PREFIX)) return null
  const parts = pathname.slice(FONT_ROUTE_PREFIX.length).split('/')
  if (parts.length !== 2) return null
  const [theme, file] = parts as [string, string]
  if (!THEME_SEGMENT.test(theme) || !FILE_SEGMENT.test(file)) return null
  const fonts = themeFonts(theme)
  if (fonts === null || !fonts.files.has(file)) return null
  try {
    return {
      body: await readFile(join(fonts.dir, file)),
      contentType: 'font/woff2',
      cacheControl: 'public, max-age=31536000, immutable',
    }
  } catch {
    return null
  }
}

/**
 * The family names a built-in theme bundles, for the drift test that keeps
 * `@cogenta/render`'s `SELF_HOSTED_FAMILIES` equal to what the packages carry.
 */
export function bundledFontFamilies(): readonly string[] {
  const families = new Set<string>()
  for (const theme of BUNDLED_FONT_THEMES) {
    for (const face of themeFonts(theme)?.manifest.faces ?? []) families.add(face.family)
  }
  return [...families].sort()
}

/** `300 700` → 400, `400` → 0. The width of the weight range a face covers. */
function weightSpan(weight: string): number {
  const [low, high] = weight.split(/\s+/u).map(Number)
  return (high ?? low ?? 0) - (low ?? 0)
}

/**
 * The `@font-face` rules of one bundled family, from the theme that carries the
 * widest weight range of it (Geist is 100–900 on `saas`, 300–700 on
 * `entreprise`). `null` for a family no theme ships.
 */
export function bundledFaceRules(family: string): readonly string[] | null {
  const wanted = family.trim().toLowerCase()
  let best: { span: number; rules: string[] } | null = null
  for (const theme of BUNDLED_FONT_THEMES) {
    const faces = (themeFonts(theme)?.manifest.faces ?? []).filter(
      (face) => face.family.toLowerCase() === wanted,
    )
    if (faces.length === 0) continue
    const span = Math.max(...faces.map((face) => weightSpan(face.weight)))
    if (best === null || span > best.span) best = { span, rules: faces.map((face) => face.css) }
  }
  return best === null ? null : best.rules
}

const SKIN_FONT_STACK = /--cogenta-font-(?:sans|serif|mono)\s*:\s*([^;}]+)/gu

/** The primary family of each of a skin sheet's three font stacks. */
export function skinFontFamilies(skinCss: string): readonly string[] {
  const families = new Set<string>()
  for (const match of skinCss.matchAll(SKIN_FONT_STACK)) {
    const family = primaryFamily(match[1] ?? '')
    if (family !== '') families.add(family)
  }
  return [...families]
}

function declaresFace(css: string, family: string): boolean {
  const escaped = family.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(
    `@font-face\\s*\\{[^}]*font-family:\\s*["']?${escaped}["']?\\s*[;}]`,
    'iu',
  ).test(css)
}

/**
 * The `@font-face` rules a stylesheet still needs for the bundled families its
 * skin names and its own rules do not already declare — what lets a skin pick a
 * face another theme ships. Empty for a skin whose families are all system
 * stacks, all declared already, or not bundled (those fall back to the next
 * family of their stack, exactly as a third-party face the site never loaded).
 */
export function missingBundledFaceCss(skinCss: string, sheet: string): string {
  const rules: string[] = []
  for (const family of skinFontFamilies(skinCss)) {
    if (declaresFace(sheet, family)) continue
    rules.push(...(bundledFaceRules(family) ?? []))
  }
  return rules.join('\n')
}

/**
 * Whether the site may load web fonts from Google (`appearance.remoteWebFonts`).
 * Set once at boot by `runServe`; read wherever a skin sheet is rendered. A
 * process-level setting rather than a parameter because the sheet is rendered
 * from seven call sites that have no config in reach, and a configuration file
 * is read once per process anyway.
 */
let remoteWebFonts = false

export function setRemoteWebFonts(enabled: boolean): void {
  remoteWebFonts = enabled
}

export function remoteWebFontsEnabled(): boolean {
  return remoteWebFonts
}

/** `renderSkin` with the site's web-font policy applied: the one place a skin sheet is rendered for a page. */
export function renderSiteSkin(input: unknown): ReturnType<typeof renderSkin> {
  return renderSkin(input, { remoteWebFonts })
}

/**
 * Head tags for fonts that come from a third party — emitted only when the
 * site owner opted in. With the default (self-hosted) there is nothing to
 * connect to ahead of time, and a `preconnect` to Google would itself leak the
 * visitor's address.
 */
export function remoteFontPreconnectTags(): string {
  return remoteWebFonts
    ? '<link rel="preconnect" href="https://fonts.googleapis.com">' +
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    : ''
}
