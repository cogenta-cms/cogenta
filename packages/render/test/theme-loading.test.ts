import { fileURLToPath } from 'node:url'
import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  defineTheme,
  loadTheme,
  parseRenderConfig,
  parseThemeManifest,
  type ThemeManifestInput,
} from '../src/index.js'

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))

describe('the theme manifest', () => {
  const valid: ThemeManifestInput = {
    name: 'canonical',
    version: '1.0.0',
    engine: '^1.0.0',
    blocks: '^1.0.0',
    implements: ['hero'],
    collections: '*',
    runtime: 'static',
    tokens: './tokens.json',
  }

  it('accepts the manifest contract D describes', () => {
    expect(defineTheme(valid).name).toBe('canonical')
  })

  it('refuses a runtime that is not one of the three delivery targets', () => {
    const error = (() => {
      try {
        return parseThemeManifest({ ...valid, runtime: 'lambda' })
      } catch (caught: unknown) {
        return caught
      }
    })()

    expect(isCogentaError(error)).toBe(true)
    if (isCogentaError(error)) expect(error.code).toBe('THEME_INVALID')
  })

  it('refuses a manifest that is missing a required field, naming the field', () => {
    const { tokens: _tokens, ...withoutTokens } = valid

    expect(() => parseThemeManifest(withoutTokens)).toThrowError(/tokens/u)
  })
})

describe('loading the active theme from the configuration', () => {
  it('reads the manifest of the theme the configuration names', async () => {
    const theme = await loadTheme({
      theme: { name: 'canonical', root: `${fixtures}canonical-theme` },
    })

    expect(theme.manifest.version).toBe('1.0.0')
    expect(theme.manifest.implements).toHaveLength(12)
  })

  it('resolves a theme by name, without an explicit root', async () => {
    // `themes/<name>` is one of the places a theme is looked for, so a fixture
    // directory named like the theme is enough.
    const theme = await loadTheme({ theme: { name: 'canonical-theme' }, cwd: fixtures })

    expect(theme.root).toContain('canonical-theme')
    expect(theme.manifest.name).toBe('canonical')
  })

  it('refuses to boot on a theme that is not installed', async () => {
    const error = await loadTheme({ theme: { name: 'absent' }, cwd: fixtures }).catch(
      (caught: unknown) => caught,
    )

    expect(isCogentaError(error)).toBe(true)
    if (!isCogentaError(error)) return
    expect(error.code).toBe('THEME_NOT_FOUND')
    expect(error.hint).toContain('theme.root')
  })

  it('reports the name the theme declares, not the directory it sits in', async () => {
    // Two namespaces: the configuration names a package, the manifest names a
    // theme. `hostile-theme` shipping a theme called `hostile` is ordinary.
    const theme = await loadTheme({ theme: { name: 'hostile-theme' }, cwd: fixtures })

    expect(theme.manifest.name).toBe('hostile')
  })

  it('accepts a manifest supplied by the host instead of read from disk', async () => {
    const theme = await loadTheme({
      theme: { name: 'canonical', root: `${fixtures}canonical-theme` },
      importManifest: async () => ({
        theme: {
          name: 'canonical',
          version: '2.0.0',
          engine: '^1.0.0',
          blocks: '^1.0.0',
          implements: [],
          collections: '*',
          runtime: 'server',
          tokens: './tokens.json',
        },
      }),
    })

    expect(theme.manifest.version).toBe('2.0.0')
  })
})

describe('the render configuration', () => {
  const valid = {
    site: {
      name: 'Le blog',
      url: 'https://example.test',
      locales: ['fr'],
      defaultLocale: 'fr',
    },
    theme: { name: 'canonical' },
    content: { url: 'https://api.example.test', token: 'read-only' },
  }

  it('accepts a complete configuration', () => {
    expect(parseRenderConfig(valid).theme.name).toBe('canonical')
  })

  it('refuses a default locale the site does not list', () => {
    expect(() =>
      parseRenderConfig({ ...valid, site: { ...valid.site, defaultLocale: 'en' } }),
    ).toThrowError(/default locale/u)
  })

  it('refuses a content API without a read token', () => {
    expect(() =>
      parseRenderConfig({ ...valid, content: { url: 'https://api.example.test' } }),
    ).toThrowError(/token/u)
  })
})
