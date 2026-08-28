import { describe, expect, it } from 'vitest'
import type {
  AdminThemeColorTokens,
  AdminThemeState,
  AdminThemeTemplate,
} from '../../src/api/admin-theme-client.js'
import { activeAdminThemeTemplate, buildAdminThemeCss } from '../../src/theme/admin-theme-css.js'

function colors(background: string, primary: string): AdminThemeColorTokens {
  return {
    background,
    foreground: '#111111',
    card: '#ffffff',
    cardForeground: '#111111',
    muted: '#eeeeee',
    mutedForeground: '#555555',
    border: '#dddddd',
    input: '#cccccc',
    ring: primary,
    primary,
    primaryForeground: '#ffffff',
    secondary: '#f5f5f5',
    secondaryForeground: '#111111',
    accent: '#f0f0f0',
    accentForeground: '#222222',
    destructive: '#c00000',
    destructiveForeground: '#ffffff',
    destructiveSurface: '#fde8e8',
    success: '#0a0',
    successForeground: '#ffffff',
    successSurface: '#e6f7e6',
    warning: '#a60',
    warningForeground: '#ffffff',
    warningSurface: '#fdf0dc',
    info: '#06c',
    infoForeground: '#ffffff',
    infoSurface: '#e0eefd',
    shadowCard: '0 1px 2px rgba(0,0,0,.1)',
    shadowRaised: '0 4px 8px rgba(0,0,0,.1)',
    shadowOverlay: '0 8px 16px rgba(0,0,0,.1)',
  }
}

const NIGHTOPS: AdminThemeTemplate = {
  id: 'nightops',
  name: 'Nightops',
  description: 'test',
  light: colors('#fafafa', '#16a34a'),
  dark: colors('#0a0b0d', '#22c55e'),
  radius: { sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' },
  fontDisplay: 'space-grotesk',
  fontBody: 'space-grotesk',
}

const ATELIER: AdminThemeTemplate = {
  id: 'atelier',
  name: 'Atelier',
  description: 'test',
  light: colors('#f2ede2', '#c23d0a'),
  dark: colors('#14100b', '#ff7a3d'),
  radius: { sm: '0.125rem', md: '0.25rem', lg: '0.375rem', xl: '0.5rem' },
  fontDisplay: 'plex-mono',
  fontBody: 'plex-sans',
}

function state(
  templateId: string,
  overrides: AdminThemeState['active']['overrides'] = {},
): AdminThemeState {
  return {
    active: { templateId, overrides, updatedAt: null, updatedBy: null },
    templates: [NIGHTOPS, ATELIER],
  }
}

describe('activeAdminThemeTemplate', () => {
  it('resolves the active template by id', () => {
    expect(activeAdminThemeTemplate(state('atelier'))?.id).toBe('atelier')
  })

  it('falls back to the first template rather than crashing on an unknown id', () => {
    expect(activeAdminThemeTemplate(state('midnight-neon'))?.id).toBe('nightops')
  })
})

describe('buildAdminThemeCss', () => {
  it('writes the whole selected template, not just the personalised handful of tokens', () => {
    const css = buildAdminThemeCss(state('atelier'))
    expect(css).toContain('--background: #f2ede2;')
    expect(css).toContain('--primary: #c23d0a;')
    expect(css).toContain('--destructive-surface: #fde8e8;')
  })

  it('emits both the media-query dark block and the explicit data-theme="dark" block, mirroring theme.css', () => {
    const css = buildAdminThemeCss(state('nightops'))
    expect(css).toContain(':root:not([data-theme="light"])')
    expect(css).toContain(':root[data-theme="dark"]')
    expect(css).toContain('--background: #0a0b0d;')
  })

  it('a primary colour override replaces primary in every emitted block (light, media-dark, explicit dark)', () => {
    const css = buildAdminThemeCss(state('nightops', { primaryColor: '#ff00ff' }))
    const occurrences = css.match(/--primary: #ff00ff;/gu) ?? []
    expect(occurrences.length).toBe(3)
  })

  it('an unset override leaves the template value untouched', () => {
    const css = buildAdminThemeCss(state('nightops'))
    expect(css).toContain('--primary: #16a34a;')
  })

  it("scales sm/lg/xl radius from an overridden md, keeping the template's own ratio", () => {
    // Atelier's own ratio: sm/md = 0.5, lg/md = 1.5, xl/md = 2.
    const css = buildAdminThemeCss(state('atelier', { radius: 0.4 }))
    expect(css).toContain('--radius-md: 0.4rem;')
    expect(css).toContain('--radius-sm: 0.2rem;')
    expect(css).toContain('--radius-lg: 0.6rem;')
    expect(css).toContain('--radius-xl: 0.8rem;')
  })

  it('resolves a font override to its real self-hosted family stack', () => {
    const css = buildAdminThemeCss(state('nightops', { fontBody: 'plex-sans' }))
    expect(css).toContain('--font-sans: "Plex Sans", "Segoe UI", system-ui, sans-serif;')
  })

  it("falls back to the template's own font when no override is set", () => {
    const css = buildAdminThemeCss(state('atelier'))
    expect(css).toContain('--font-display: "Plex Mono"')
  })

  it('scopes every block to a caller-supplied selector instead of `:root`, for a preview panel (fiche 49)', () => {
    const scope = '[data-admin-theme-preview="abc"]'
    const css = buildAdminThemeCss(state('nightops'), scope)
    expect(css).toContain(`${scope} {`)
    expect(css).toContain(`${scope}:not([data-theme="light"])`)
    expect(css).toContain(`${scope}[data-theme="dark"]`)
    expect(css).not.toContain(':root')
  })
})
