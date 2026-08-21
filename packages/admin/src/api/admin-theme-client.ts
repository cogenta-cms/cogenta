import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/admin-theme` (L21 task 2) — hand-mirrored
 * from `@cogenta/api`'s `admin-theme-router.ts`, the same convention every
 * other `*-client.ts` in this directory already follows for its own router.
 *
 * Deliberately separate from `theme-client.ts` (the public **site's**
 * theming, contract D): this is the admin's own runtime template, a
 * different surface with a different audience, never merged with it.
 */

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
  readonly id: string
  readonly name: string
  readonly description: string
  readonly light: AdminThemeColorTokens
  readonly dark: AdminThemeColorTokens
  readonly radius: AdminThemeRadiusTokens
  readonly fontDisplay: string
  readonly fontBody: string
}

export interface AdminThemeOverrides {
  readonly primaryColor?: string
  readonly backgroundColor?: string
  readonly textColor?: string
  readonly fontDisplay?: string
  readonly fontBody?: string
  readonly radius?: number
  readonly logoMediaId?: string | null
}

export interface AdminThemeActive {
  readonly templateId: string
  readonly overrides: AdminThemeOverrides
  readonly updatedAt: string | null
  readonly updatedBy: string | null
}

export interface AdminThemeState {
  readonly active: AdminThemeActive
  readonly templates: readonly AdminThemeTemplate[]
}

/**
 * Hand-mirrored from `@cogenta/schema`'s `ADMIN_THEME_FONTS` — the admin
 * cannot import that package directly (it is server-side, Drizzle and all),
 * the same reason every other `*-client.ts` here re-declares its server
 * shape by hand rather than sharing a type import.
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
]

export function adminThemeFontById(id: string): AdminThemeFontOption | undefined {
  return ADMIN_THEME_FONTS.find((font) => font.id === id)
}

export function getAdminTheme(): Promise<AdminThemeState> {
  return request('/api/admin-theme')
}

export function setAdminTheme(
  token: string,
  templateId: string,
  overrides: AdminThemeOverrides,
): Promise<AdminThemeState> {
  return request('/api/admin-theme', {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ templateId, overrides }),
  })
}
