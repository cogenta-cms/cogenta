import { describe, expect, it } from 'vitest'
import {
  availableThemes,
  BUILTIN_THEMES,
  DEFAULT_THEME_NAME,
  resolveTheme,
} from '../src/commands/theme-registry.js'

describe('theme registry (fiche L23)', () => {
  it('lists the default theme among what this build can offer', () => {
    const themes = availableThemes()
    expect(themes.some((theme) => theme.name === DEFAULT_THEME_NAME)).toBe(true)
    // Every listed name must resolve — a picker that shows an entry
    // `resolveTheme` cannot actually load would let an admin select a theme
    // that then silently falls back, with no error anywhere.
    for (const theme of themes) {
      expect(BUILTIN_THEMES.some((builtin) => builtin.name === theme.name)).toBe(true)
    }
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
})
