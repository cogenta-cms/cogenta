import { describe, expect, it } from 'vitest'
import {
  availableThemes,
  BUILTIN_THEMES,
  DEFAULT_THEME_NAME,
  resolveTheme,
} from '../src/commands/theme-registry.js'

describe('theme registry (fiche L23)', () => {
  it('lists the default theme among what this build can offer', async () => {
    const themes = await availableThemes()
    expect(themes.some((theme) => theme.name === DEFAULT_THEME_NAME)).toBe(true)
    // Every listed name must resolve — a picker that shows an entry
    // `resolveTheme` cannot actually load would let an admin select a theme
    // that then silently falls back, with no error anywhere.
    for (const theme of themes) {
      expect(BUILTIN_THEMES.some((builtin) => builtin.name === theme.name)).toBe(true)
    }
  })

  it('reads label from the registry and description/version/author from the loaded manifest (fiche 48)', async () => {
    const themes = await availableThemes()
    const canonical = themes.find((theme) => theme.name === DEFAULT_THEME_NAME)
    expect(canonical).toBeDefined()
    expect(canonical?.label).toBe('Canonical')
    // The manifest, not a hardcoded string in this file — theme.config.ts is
    // what fiche 48 task 2 populated, and this is what task 3 must read.
    expect(canonical?.description).toContain('reference theme')
    expect(canonical?.version).toBe('1.1.0')
    expect(canonical?.author).toBe('Cogenta')
  })

  it('resolves the default theme for null, undefined and an unrecognised name alike', async () => {
    const forNull = await resolveTheme(null)
    const forUndefined = await resolveTheme(undefined)
    const forUnknown = await resolveTheme('@cogenta/theme-does-not-exist')
    expect(forNull).toBe(forUndefined)
    expect(forNull).toBe(forUnknown)
  })

  it('resolves the real theme module, with a renderPage and a renderChrome a theme actually exports', async () => {
    const theme = await resolveTheme(DEFAULT_THEME_NAME)
    expect(typeof theme.renderPage).toBe('function')
    expect(typeof theme.renderChrome).toBe('function')
  })

  it('memoises by name: two resolutions of the same theme return the same module instance', async () => {
    const first = await resolveTheme(DEFAULT_THEME_NAME)
    const second = await resolveTheme(DEFAULT_THEME_NAME)
    expect(first).toBe(second)
  })

  it('resolves the portfolio theme (fiche L23) with a real renderPage and renderChrome', async () => {
    const theme = await resolveTheme('@cogenta/theme-portfolio')
    expect(typeof theme.renderPage).toBe('function')
    expect(typeof theme.renderChrome).toBe('function')
    // Two genuinely installable themes, not one theme and a placeholder.
    expect(theme).not.toBe(await resolveTheme(DEFAULT_THEME_NAME))
  })
})
