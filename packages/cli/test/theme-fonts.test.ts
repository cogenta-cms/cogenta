import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SELF_HOSTED_FAMILIES } from '@cogenta/render'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BUNDLED_FONT_THEMES,
  bundledFaceRules,
  bundledFontFamilies,
  FONT_ROUTE_PREFIX,
  missingBundledFaceCss,
  remoteFontPreconnectTags,
  renderSiteSkin,
  serveThemeFont,
  setRemoteWebFonts,
  skinFontFamilies,
} from '../src/commands/theme-fonts.js'
import { BUILTIN_THEMES } from '../src/commands/theme-registry.js'
import { joinStyles } from '../src/commands/theme-render.js'

/**
 * The route and the skin bridge — the two jobs of `theme-fonts.ts`, without a
 * server. The end-to-end behaviour (a real page of
 * every theme, no request leaving the site) is `serve-fonts.test.ts`.
 */

afterEach(() => setRemoteWebFonts(false))

const SKIN_TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f2f4f7',
    mutedFg: '#3f4655',
    border: '#d7dbe2',
  },
  font: {
    sans: "'Geist', system-ui, sans-serif",
    serif: "'Playfair Display', Georgia, serif",
    mono: 'ui-monospace, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(22, 24, 29, 0.08)', md: '0 6px 24px rgba(22, 24, 29, 0.12)' },
}

describe('the bundled themes', () => {
  it('are exactly the built-in themes the registry ships', () => {
    const registry = BUILTIN_THEMES.map((theme) => theme.name.replace('@cogenta/theme-', '')).sort()
    expect([...BUNDLED_FONT_THEMES].sort()).toEqual(registry)
  })

  it('carry every family @cogenta/render says is self-hosted, and no other', () => {
    // The catalogue the skin generator offers while remote fonts are off must
    // be exactly what the packages really send, or a skin would name a face
    // that silently falls back.
    expect(bundledFontFamilies()).toEqual([...SELF_HOSTED_FAMILIES].sort())
  })

  it('ship a font file for every face the manifest lists, in the package directory the route serves', async () => {
    for (const theme of BUNDLED_FONT_THEMES) {
      const manifestUrl = import.meta.resolve(`@cogenta/theme-${theme}/fonts/manifest.json`)
      const manifest = JSON.parse(readFileSync(fileURLToPath(manifestUrl), 'utf8')) as {
        faces: { file: string }[]
      }
      for (const face of manifest.faces) {
        const asset = await serveThemeFont(`${FONT_ROUTE_PREFIX}${theme}/${face.file}`)
        expect(asset, `${theme}/${face.file}`).not.toBeNull()
        expect(asset?.body.subarray(0, 4).toString('latin1')).toBe('wOF2')
      }
      // …and the directory holds nothing else that is a font.
      const onDisk = readdirSync(fileURLToPath(new URL('.', manifestUrl))).filter((name) =>
        name.endsWith('.woff2'),
      )
      expect(onDisk.sort()).toEqual(manifest.faces.map((face) => face.file).sort())
    }
  })
})

describe('serveThemeFont', () => {
  it('answers a listed file with the font type and a year-long immutable cache', async () => {
    const manifest = JSON.parse(
      readFileSync(
        fileURLToPath(import.meta.resolve('@cogenta/theme-saas/fonts/manifest.json')),
        'utf8',
      ),
    ) as { faces: { file: string }[] }
    const file = manifest.faces[0]?.file as string
    const asset = await serveThemeFont(`/_cogenta/fonts/saas/${file}`)
    expect(asset?.contentType).toBe('font/woff2')
    expect(asset?.cacheControl).toBe('public, max-age=31536000, immutable')
  })

  it.each([
    ['not under the prefix', '/other/saas/geist.woff2'],
    ['no file', '/_cogenta/fonts/saas'],
    ['an empty file', '/_cogenta/fonts/saas/'],
    ['a theme alone with a slash', '/_cogenta/fonts//geist.woff2'],
    ['a deeper path', '/_cogenta/fonts/saas/a/geist.woff2'],
    ['a parent segment', '/_cogenta/fonts/saas/../blog/geist.woff2'],
    ['a parent as the theme', '/_cogenta/fonts/../saas/geist.woff2'],
    ['an encoded parent', '/_cogenta/fonts/saas/%2e%2e/geist.woff2'],
    ['an encoded slash', '/_cogenta/fonts/saas/..%2fgeist.woff2'],
    ['a backslash', '/_cogenta/fonts/saas/..\\geist.woff2'],
    ['a null byte', '/_cogenta/fonts/saas/geist.woff2%00'],
    ['an unknown theme', '/_cogenta/fonts/nonesuch/geist.woff2'],
    ['a package name as a theme', '/_cogenta/fonts/@cogenta/theme-saas/geist.woff2'],
    ['an upper-case theme', '/_cogenta/fonts/SAAS/geist.woff2'],
    ['a file nobody listed', '/_cogenta/fonts/saas/geist.woff2'],
    ['the manifest', '/_cogenta/fonts/saas/manifest.json'],
    ['the readme', '/_cogenta/fonts/saas/README.md'],
    ['a licence', '/_cogenta/fonts/saas/OFL-geist.txt'],
    ['another extension', '/_cogenta/fonts/saas/geist-normal-latin.woff'],
  ])('refuses %s', async (_label, path) => {
    expect(await serveThemeFont(path)).toBeNull()
  })

  it("refuses a real file under another theme's name", async () => {
    const file = JSON.parse(
      readFileSync(
        fileURLToPath(import.meta.resolve('@cogenta/theme-saas/fonts/manifest.json')),
        'utf8',
      ),
    ).faces[0].file as string
    expect(await serveThemeFont(`/_cogenta/fonts/saas/${file}`)).not.toBeNull()
    expect(await serveThemeFont(`/_cogenta/fonts/blog/${file}`)).toBeNull()
  })
})

describe('a skin that names a bundled family', () => {
  it('reads the primary family of each stack of a skin sheet, quoted or not, minified or not', () => {
    const sheet = renderSiteSkin(SKIN_TOKENS).css
    expect(skinFontFamilies(sheet)).toEqual(['Geist', 'Playfair Display', 'ui-monospace'])
    expect(
      skinFontFamilies(
        ":root{--cogenta-font-sans:'Fraunces',serif;--cogenta-font-mono:Karla,mono}",
      ),
    ).toEqual(['Fraunces', 'Karla'])
  })

  it('gets the faces from the theme that carries the widest weight range', () => {
    const rules = bundledFaceRules('Geist') as string[]
    expect(rules.length).toBeGreaterThan(0)
    // 100–900 on `saas`, 300–700 on `entreprise`.
    for (const rule of rules) {
      expect(rule).toContain('/_cogenta/fonts/saas/')
      expect(rule).toContain('font-weight: 100 900')
    }
    expect(bundledFaceRules('geist mono')).not.toBeNull()
    expect(bundledFaceRules('Playfair Display')).toBeNull()
  })

  it('adds only the faces the sheet does not declare already, for bundled families only', () => {
    const skin = renderSiteSkin(SKIN_TOKENS).css
    const missing = missingBundledFaceCss(skin, '.a{color:red}')
    expect(missing).toContain("font-family: 'Geist'")
    expect(missing).not.toContain('Playfair')
    expect(missing).not.toContain('Geist Mono')

    const declared = "@font-face{font-family:'Geist';src:url(/_cogenta/fonts/saas/x.woff2)}"
    expect(missingBundledFaceCss(skin, declared)).toBe('')
    // `Geist Mono` declared does not stand in for `Geist`.
    const mono = "@font-face{font-family:'Geist Mono';src:url(/_cogenta/fonts/saas/m.woff2)}"
    expect(missingBundledFaceCss(skin, mono)).toContain("font-family: 'Geist'")
  })

  it('is part of the joined stylesheet, after the theme, with no import', () => {
    const joined = joinStyles(renderSiteSkin(SKIN_TOKENS).css, '.a{color:red}') as string
    expect(joined).not.toContain('@import')
    expect(joined).toContain('@font-face')
    expect(joined.indexOf('.a{color:red}')).toBeLessThan(joined.indexOf('@font-face'))
  })
})

describe('the remote web font setting', () => {
  it('is off by default: the skin sheet carries no import and the head no preconnect', () => {
    expect(renderSiteSkin(SKIN_TOKENS).css).not.toMatch(/@import|googleapis/)
    expect(remoteFontPreconnectTags()).toBe('')
  })

  it('turns on the import of a non-bundled family, and the preconnect for it, and nothing for a bundled one', () => {
    setRemoteWebFonts(true)
    const css = renderSiteSkin(SKIN_TOKENS).css
    expect(css).toContain('family=Playfair+Display')
    expect(css).not.toContain('family=Geist')
    expect(remoteFontPreconnectTags()).toContain('https://fonts.googleapis.com')
    expect(remoteFontPreconnectTags()).toContain('https://fonts.gstatic.com')
  })
})
