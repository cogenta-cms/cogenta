import { z } from 'zod'

/**
 * The admin's own runtime theming system (L21 task 2).
 *
 * `packages/admin/src/styles/theme.css` ships exactly one design, hard-coded
 * ("Nightops" as of this session — see that file's own header for the full
 * design rationale). Nothing lets an install pick a different one, or nudge
 * a handful of tokens (a brand colour, a logo) without editing and
 * rebuilding the CSS. This module is the data half of the fix: two built-in
 * **templates** — complete, self-contained token sets an install starts
 * from — plus a small, curated set of **overrides** a template can be
 * personalised with (`AdminThemeOverrides`). `admin-theme-store.ts` is the
 * persistence half; `packages/admin/src/theme/admin-theme-context.tsx` is
 * the half that actually paints the result.
 *
 * Two decisions this module encodes and the rest of the feature depends on:
 *
 * 1. **A template is complete, never partial.** Both built-in templates
 *    below carry every token `theme.css` defines — surfaces, actions,
 *    status colours, shadows, radius, type — for both colour schemes. A
 *    template that only redefined "the interesting" tokens would leave an
 *    install with, say, Nightops' status colours under Atelier's surfaces:
 *    a broken hybrid nobody asked for. Copied verbatim from the CSS each
 *    template represents (`theme.css` itself for "nightops"; `git show
 *    6c1c5bf^:packages/admin/src/styles/theme.css` for "atelier", the
 *    design that shipped immediately before the Nightops reskin).
 * 2. **Personalising never rewrites a template.** `AdminThemeOverrides` is a
 *    much smaller, separate shape — the handful of levers the settings
 *    screen actually exposes (fiche's own list: primary/background/text
 *    colour, display font, body font, logo, corner radius) — stored
 *    alongside a `templateId`, never merged into `ADMIN_THEME_TEMPLATES`
 *    itself. Switching template throws no personalisation away by
 *    accident (it stays applied to whichever template is active next), and
 *    the two built-in constants below stay exactly what a fresh install
 *    ships, forever.
 */

export type AdminThemeTemplateId = 'nightops' | 'atelier'

export const ADMIN_THEME_TEMPLATE_IDS: readonly AdminThemeTemplateId[] = ['nightops', 'atelier']

export interface AdminThemeColorTokens {
  readonly background: string
  readonly foreground: string
  readonly card: string
  readonly cardForeground: string
  readonly muted: string
  readonly mutedForeground: string
  readonly border: string
  readonly input: string
  readonly ring: string
  readonly primary: string
  readonly primaryForeground: string
  readonly secondary: string
  readonly secondaryForeground: string
  readonly accent: string
  readonly accentForeground: string
  readonly destructive: string
  readonly destructiveForeground: string
  readonly destructiveSurface: string
  readonly success: string
  readonly successForeground: string
  readonly successSurface: string
  readonly warning: string
  readonly warningForeground: string
  readonly warningSurface: string
  readonly info: string
  readonly infoForeground: string
  readonly infoSurface: string
  readonly shadowCard: string
  readonly shadowRaised: string
  readonly shadowOverlay: string
}

export interface AdminThemeRadiusTokens {
  readonly sm: string
  readonly md: string
  readonly lg: string
  readonly xl: string
}

export interface AdminThemeTemplate {
  readonly id: AdminThemeTemplateId
  /** Plain proper noun, not translated — the same convention `GallerySkin.displayName` already uses for the site's own skin gallery. */
  readonly name: string
  readonly description: string
  readonly light: AdminThemeColorTokens
  readonly dark: AdminThemeColorTokens
  readonly radius: AdminThemeRadiusTokens
  /** A font option id from `ADMIN_THEME_FONTS` below. */
  readonly fontDisplay: string
  readonly fontBody: string
}

/**
 * Every font a template or an override may name. A closed list, not free
 * text: the admin only ever self-hosts these four families plus the
 * platform default (R1 — no runtime request to Google Fonts), so a
 * personalisation cannot ask for a face nothing actually serves.
 */
export interface AdminThemeFontOption {
  readonly id: string
  readonly label: string
  readonly family: string
}

export const ADMIN_THEME_FONTS: readonly AdminThemeFontOption[] = [
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    family: '"Space Grotesk", "Segoe UI", system-ui, sans-serif',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  {
    id: 'plex-sans',
    label: 'IBM Plex Sans',
    family: '"Plex Sans", "Segoe UI", system-ui, sans-serif',
  },
  {
    id: 'plex-mono',
    label: 'IBM Plex Mono',
    family: '"Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  { id: 'system', label: 'System UI', family: 'system-ui, "Segoe UI", sans-serif' },
] as const

const ADMIN_THEME_FONT_IDS = ADMIN_THEME_FONTS.map((font) => font.id)

export function adminThemeFontById(id: string): AdminThemeFontOption | undefined {
  return ADMIN_THEME_FONTS.find((font) => font.id === id)
}

/** "Nightops" — the console direction this admin currently ships (`theme.css`, verbatim). */
const NIGHTOPS: AdminThemeTemplate = {
  id: 'nightops',
  name: 'Nightops',
  description:
    'A dark navy navigation rail beside a crisp workspace, one electric-indigo accent. Space Grotesk throughout, JetBrains Mono for technical details.',
  light: {
    background: '#f4f6fb',
    foreground: '#0d1220',
    card: '#ffffff',
    cardForeground: '#0d1220',
    muted: '#eef1f7',
    mutedForeground: '#5b6478',
    border: '#e2e6ef',
    input: '#cdd3e0',
    ring: 'oklch(0.55 0.21 268)',
    primary: 'oklch(0.55 0.21 268)',
    primaryForeground: '#f5f6ff',
    secondary: '#f1f3f9',
    secondaryForeground: '#0d1220',
    accent: 'oklch(0.55 0.21 268 / 10%)',
    accentForeground: 'oklch(0.42 0.19 268)',
    destructive: 'oklch(0.58 0.22 25)',
    destructiveForeground: '#fff6f5',
    destructiveSurface: 'oklch(0.58 0.22 25 / 10%)',
    success: 'oklch(0.6 0.16 155)',
    successForeground: '#f2fff7',
    successSurface: 'oklch(0.6 0.16 155 / 12%)',
    warning: 'oklch(0.7 0.16 70)',
    warningForeground: '#211703',
    warningSurface: 'oklch(0.7 0.16 70 / 14%)',
    info: 'oklch(0.6 0.15 235)',
    infoForeground: '#f5f9ff',
    infoSurface: 'oklch(0.6 0.15 235 / 10%)',
    shadowCard: '0 1px 2px rgb(13 18 32 / 0.04), 0 2px 6px rgb(13 18 32 / 0.05)',
    shadowRaised: '0 4px 10px -2px rgb(13 18 32 / 0.08), 0 16px 32px -8px rgb(13 18 32 / 0.12)',
    shadowOverlay: '0 8px 16px -4px rgb(13 18 32 / 0.12), 0 32px 64px -16px rgb(13 18 32 / 0.2)',
  },
  dark: {
    background: '#090b12',
    foreground: 'oklch(0.93 0.008 270)',
    card: '#10131c',
    cardForeground: 'oklch(0.93 0.008 270)',
    muted: '#161a26',
    mutedForeground: 'oklch(0.7 0.015 270)',
    border: 'oklch(1 0 0 / 8%)',
    input: 'oklch(1 0 0 / 14%)',
    ring: 'oklch(0.76 0.16 268)',
    primary: 'oklch(0.76 0.16 268)',
    primaryForeground: '#0b0d1a',
    secondary: '#161a26',
    secondaryForeground: 'oklch(0.93 0.008 270)',
    accent: 'oklch(0.76 0.16 268 / 16%)',
    accentForeground: 'oklch(0.82 0.14 268)',
    destructive: 'oklch(0.7 0.19 25)',
    destructiveForeground: '#1c0704',
    destructiveSurface: 'oklch(0.7 0.19 25 / 14%)',
    success: 'oklch(0.78 0.17 155)',
    successForeground: '#04130a',
    successSurface: 'oklch(0.78 0.17 155 / 14%)',
    warning: 'oklch(0.8 0.15 75)',
    warningForeground: '#1f1503',
    warningSurface: 'oklch(0.8 0.15 75 / 14%)',
    info: 'oklch(0.76 0.13 235)',
    infoForeground: '#071420',
    infoSurface: 'oklch(0.76 0.13 235 / 14%)',
    shadowCard: '0 1px 0 rgb(0 0 0 / 0.4), 0 4px 12px -2px rgb(0 0 0 / 0.45)',
    shadowRaised: '0 2px 0 rgb(0 0 0 / 0.45), 0 16px 32px -8px rgb(0 0 0 / 0.55)',
    shadowOverlay: '0 4px 0 rgb(0 0 0 / 0.5), 0 40px 80px -16px rgb(0 0 0 / 0.7)',
  },
  radius: { sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.25rem' },
  fontDisplay: 'space-grotesk',
  fontBody: 'space-grotesk',
}

/**
 * "Atelier" — the warm, printed-paper design that shipped before the
 * Nightops reskin, recovered from git history
 * (`git show 6c1c5bf^:packages/admin/src/styles/theme.css`) rather than
 * rewritten from memory, so its values are exactly what shipped, not an
 * approximation of it.
 */
const ATELIER: AdminThemeTemplate = {
  id: 'atelier',
  name: 'Atelier',
  description:
    'Warm, unbleached paper and a burnt-orange accent, set in IBM Plex — an editorial, printed-form register rather than a console.',
  light: {
    background: '#f2ede2',
    foreground: '#201a11',
    card: '#faf7f0',
    cardForeground: '#201a11',
    muted: '#e6dfcf',
    mutedForeground: '#6b6152',
    border: '#d8cfb8',
    input: '#c2b799',
    ring: '#c23d0a',
    primary: '#c23d0a',
    primaryForeground: '#fff6ec',
    secondary: '#faf7f0',
    secondaryForeground: '#201a11',
    accent: '#ece0c8',
    accentForeground: '#5c2c0c',
    destructive: '#a3140a',
    destructiveForeground: '#fff6ec',
    destructiveSurface: '#f8e6de',
    success: '#266b3d',
    successForeground: '#f4fbf1',
    successSurface: '#e6f0dd',
    warning: '#8a5a05',
    warningForeground: '#fdf6e6',
    warningSurface: '#f3e7c9',
    info: '#295a8a',
    infoForeground: '#eff6ff',
    infoSurface: '#dfe9f3',
    shadowCard: '0 1px 0 rgb(32 26 17 / 0.08), 0 3px 8px -2px rgb(32 26 17 / 0.1)',
    shadowRaised: '0 2px 0 rgb(32 26 17 / 0.1), 0 12px 24px -8px rgb(32 26 17 / 0.18)',
    shadowOverlay: '0 4px 0 rgb(32 26 17 / 0.14), 0 32px 64px -16px rgb(32 26 17 / 0.32)',
  },
  dark: {
    background: '#14100b',
    foreground: '#f1e9d8',
    card: '#1c1710',
    cardForeground: '#f1e9d8',
    muted: '#241d13',
    mutedForeground: '#a99a80',
    border: '#362b1a',
    input: '#4a3b23',
    ring: '#ff7a3d',
    primary: '#ff7a3d',
    primaryForeground: '#1c0f04',
    secondary: '#241d13',
    secondaryForeground: '#f1e9d8',
    accent: '#2c2213',
    accentForeground: '#ffcda3',
    destructive: '#ff6350',
    destructiveForeground: '#1c0704',
    destructiveSurface: '#2c1510',
    success: '#6bc98d',
    successForeground: '#07170c',
    successSurface: '#142016',
    warning: '#e0ab3f',
    warningForeground: '#1f1503',
    warningSurface: '#26200e',
    info: '#7fb3e0',
    infoForeground: '#071420',
    infoSurface: '#14202c',
    shadowCard: '0 1px 0 rgb(0 0 0 / 0.5), 0 3px 10px -2px rgb(0 0 0 / 0.5)',
    shadowRaised: '0 2px 0 rgb(0 0 0 / 0.55), 0 16px 32px -8px rgb(0 0 0 / 0.6)',
    shadowOverlay: '0 4px 0 rgb(0 0 0 / 0.6), 0 40px 80px -16px rgb(0 0 0 / 0.75)',
  },
  radius: { sm: '0.125rem', md: '0.25rem', lg: '0.375rem', xl: '0.5rem' },
  fontDisplay: 'plex-mono',
  fontBody: 'plex-sans',
}

export const ADMIN_THEME_TEMPLATES: readonly AdminThemeTemplate[] = [NIGHTOPS, ATELIER]

export function adminThemeTemplateById(id: string): AdminThemeTemplate | undefined {
  return ADMIN_THEME_TEMPLATES.find((template) => template.id === id)
}

export const DEFAULT_ADMIN_THEME_TEMPLATE_ID: AdminThemeTemplateId = 'nightops'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/u

/**
 * The curated, small set of levers the settings screen exposes — fiche's
 * own list, kept identical: primary/background/text colour, display font,
 * body font, admin logo, corner radius. Every field is optional: an
 * override object only carries what a human actually changed, and an unset
 * field falls back to the active template's own value, never to a second
 * hard-coded default that could drift from it.
 *
 * Colours are plain `#rrggbb` (an `<input type="color">` cannot produce
 * anything else) applied to both colour schemes alike — a real
 * simplification against Nightops' own "never the same literal colour in
 * both modes" rule, accepted deliberately: per-scheme personalisation would
 * double the form for a lever this task scopes as a handful of fields, and
 * a slightly-off shade in one scheme is a cosmetic cost, not a functional
 * one.
 */
export const adminThemeOverridesSchema = z
  .object({
    primaryColor: z.string().regex(HEX_COLOR, 'Expected a #rrggbb colour.').optional(),
    backgroundColor: z.string().regex(HEX_COLOR, 'Expected a #rrggbb colour.').optional(),
    textColor: z.string().regex(HEX_COLOR, 'Expected a #rrggbb colour.').optional(),
    fontDisplay: z.enum(ADMIN_THEME_FONT_IDS as [string, ...string[]]).optional(),
    fontBody: z.enum(ADMIN_THEME_FONT_IDS as [string, ...string[]]).optional(),
    /** Base (`md`) corner radius in rem; `sm`/`lg`/`xl` scale from it using the active template's own ratios. */
    radius: z.number().min(0).max(2).optional(),
    /** A `@cogenta/schema` media asset id, or `null` to clear a previously set logo. */
    logoMediaId: z.string().min(1).nullable().optional(),
  })
  .strict()

export type AdminThemeOverrides = z.infer<typeof adminThemeOverridesSchema>
