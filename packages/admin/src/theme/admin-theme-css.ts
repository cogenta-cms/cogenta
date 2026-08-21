import type {
  AdminThemeColorTokens,
  AdminThemeOverrides,
  AdminThemeRadiusTokens,
  AdminThemeState,
  AdminThemeTemplate,
} from '../api/admin-theme-client.js'
import { adminThemeFontById } from '../api/admin-theme-client.js'

/**
 * Turns `GET /api/admin-theme`'s response into the runtime `<style>` block
 * that overrides `theme.css`'s own hard-coded tokens (L21 task 2).
 *
 * A pure function, deliberately: `admin-theme-context.tsx` is the only
 * caller that touches the DOM, so the CSS-generation logic itself is
 * testable without mounting React or jsdom's `<style>` handling.
 *
 * Two things this has to get right, both load-bearing:
 *
 * 1. **A template is applied whole, every time.** Even a template with zero
 *    personalisation still needs every one of its ~29 colour tokens
 *    written out, in both colour schemes — the running page already carries
 *    `theme.css`'s own "Nightops" tokens, and switching to "Atelier" has to
 *    override all of them, not just the handful this task's own
 *    personalisation form exposes.
 * 2. **The two colour-scheme selectors mirror `theme.css`'s own mechanism
 *    exactly** (`ThemeProvider`'s `data-theme` attribute wins over
 *    `prefers-color-scheme` in both directions) — a third, independent
 *    implementation of that logic here would drift from it the first time
 *    either one changes.
 */

const CAMEL_TO_KEBAB = /[A-Z]/gu

function cssVarName(key: string): string {
  return `--${key.replace(CAMEL_TO_KEBAB, (letter) => `-${letter.toLowerCase()}`)}`
}

function colorDeclarations(tokens: AdminThemeColorTokens): string {
  return (Object.entries(tokens) as [keyof AdminThemeColorTokens, string][])
    .map(([key, value]) => `  ${cssVarName(key)}: ${value};`)
    .join('\n')
}

function applyColorOverrides(
  tokens: AdminThemeColorTokens,
  overrides: AdminThemeOverrides,
): AdminThemeColorTokens {
  return {
    ...tokens,
    ...(overrides.backgroundColor === undefined ? {} : { background: overrides.backgroundColor }),
    ...(overrides.textColor === undefined ? {} : { foreground: overrides.textColor }),
    ...(overrides.primaryColor === undefined
      ? {}
      : { primary: overrides.primaryColor, ring: overrides.primaryColor }),
  }
}

function parseRem(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** `radius` overrides the template's `md` value; `sm`/`lg`/`xl` keep the template's own ratio to it. */
function scaledRadius(
  template: AdminThemeRadiusTokens,
  overrideMd: number | undefined,
): AdminThemeRadiusTokens {
  if (overrideMd === undefined) return template
  const baseMd = parseRem(template.md)
  if (baseMd === 0) {
    return {
      sm: `${overrideMd}rem`,
      md: `${overrideMd}rem`,
      lg: `${overrideMd}rem`,
      xl: `${overrideMd}rem`,
    }
  }
  const ratio = overrideMd / baseMd
  const scale = (value: string): string => `${Number((parseRem(value) * ratio).toFixed(3))}rem`
  return {
    sm: scale(template.sm),
    md: `${overrideMd}rem`,
    lg: scale(template.lg),
    xl: scale(template.xl),
  }
}

function fontFamilyFor(fontId: string | undefined, fallbackTemplateFontId: string): string {
  const chosen = fontId === undefined ? undefined : adminThemeFontById(fontId)
  if (chosen !== undefined) return chosen.family
  return adminThemeFontById(fallbackTemplateFontId)?.family ?? 'system-ui, sans-serif'
}

export function activeAdminThemeTemplate(state: AdminThemeState): AdminThemeTemplate | null {
  return (
    state.templates.find((template) => template.id === state.active.templateId) ??
    state.templates[0] ??
    null
  )
}

export function buildAdminThemeCss(state: AdminThemeState): string {
  const template = activeAdminThemeTemplate(state)
  if (template === null) return ''

  const overrides = state.active.overrides
  const light = applyColorOverrides(template.light, overrides)
  const dark = applyColorOverrides(template.dark, overrides)
  const radius = scaledRadius(template.radius, overrides.radius)
  const fontSans = fontFamilyFor(overrides.fontBody, template.fontBody)
  const fontDisplay = fontFamilyFor(overrides.fontDisplay, template.fontDisplay)

  const typeAndRadius = [
    `  --radius-sm: ${radius.sm};`,
    `  --radius-md: ${radius.md};`,
    `  --radius-lg: ${radius.lg};`,
    `  --radius-xl: ${radius.xl};`,
    `  --font-sans: ${fontSans};`,
    `  --font-mono: ${fontSans};`,
    `  --font-display: ${fontDisplay};`,
  ].join('\n')

  return [
    ':root {',
    colorDeclarations(light),
    typeAndRadius,
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    colorDeclarations(dark),
    '  }',
    '}',
    ':root[data-theme="dark"] {',
    colorDeclarations(dark),
    '}',
  ].join('\n')
}
