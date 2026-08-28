import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/theme` — hand-mirrored from
 * `@cogenta/api`'s `theme-router.ts`, the same way every other
 * `*-client.ts` in this directory copies its server-side shape by hand.
 */

export interface ThemeOverrides {
  readonly tokenOverrides: Record<string, unknown> | null
  readonly additionalCss: string | null
  readonly logoMediaId: string | null
  readonly logoDarkMediaId: string | null
  readonly faviconMediaId: string | null
  readonly shareImageMediaId: string | null
  /** The active theme *package* name (fiche L23), or `null` for the built-in default. */
  readonly activeTheme: string | null
  readonly updatedAt: string
  readonly updatedBy: string | null
}

/** One entry of the theme gallery — a package this instance can render the public site with. */
export interface AvailableTheme {
  readonly name: string
  readonly label: string
  readonly description: string
  /** The theme contract's own version (`ThemeManifest.version`), distinct from the npm package version — fiche 48. */
  readonly version: string
  /** Who publishes the theme, or `null` when it does not declare one. */
  readonly author: string | null
}

export interface GallerySkin {
  readonly id: string
  readonly displayName: string
  readonly description: string | null
  readonly submittedAt: string
  readonly tokens: Record<string, unknown> | null
}

export interface ThemeState {
  readonly fileTokens: Record<string, unknown> | null
  readonly effectiveTokens: Record<string, unknown> | null
  readonly overrides: ThemeOverrides
  readonly skins: readonly GallerySkin[]
  readonly aiAvailable: boolean
  readonly exportAvailable: boolean
  readonly availableThemes: readonly AvailableTheme[]
}

export interface SkinCandidate {
  readonly id: string
  readonly label: string
  readonly rationale: string
  readonly tokens: Record<string, unknown>
}

export function getTheme(token: string): Promise<ThemeState> {
  return request<ThemeState>('/api/theme', { headers: authHeader(token) })
}

export function saveThemeOverrides(
  token: string,
  input: {
    readonly tokenOverrides?: Record<string, unknown> | null
    readonly additionalCss?: string | null
    readonly logoMediaId?: string | null
    readonly logoDarkMediaId?: string | null
    readonly faviconMediaId?: string | null
    readonly shareImageMediaId?: string | null
    readonly activeTheme?: string | null
  },
): Promise<ThemeOverrides> {
  return request<ThemeOverrides>('/api/theme/overrides', {
    method: 'PUT',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function clearThemeOverrides(token: string): Promise<ThemeOverrides> {
  return request<ThemeOverrides>('/api/theme/overrides', {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export function applyGallerySkin(token: string, id: string): Promise<ThemeOverrides> {
  return request<ThemeOverrides>(`/api/theme/skins/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function generateSkinCandidates(
  token: string,
  description: string,
): Promise<{ readonly candidates: readonly SkinCandidate[] }> {
  return request<{ readonly candidates: readonly SkinCandidate[] }>('/api/theme/generate', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ description }),
  })
}

export function exportThemeToFile(token: string): Promise<{ readonly exported: boolean }> {
  return request<{ readonly exported: boolean }>('/api/theme/export', {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function previewTheme(
  token: string,
  input: {
    readonly pathname?: string
    readonly tokens?: Record<string, unknown>
    readonly additionalCss?: string
  },
): Promise<{ readonly html: string }> {
  return request<{ readonly html: string }>('/api/theme/preview', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/**
 * The theme *gallery*'s visual preview (fiche L24 task 5) — a fixed,
 * database-free demo page rendered through one candidate theme package,
 * distinct from `previewTheme` above (a colour/token candidate on the site's
 * own real home page, in the currently active theme). Every card in the
 * gallery calls this once, by name, so switching which theme is shown never
 * touches `PUT /api/theme/overrides`.
 */
export function previewThemeGallery(
  token: string,
  theme: string,
): Promise<{ readonly html: string }> {
  return request<{ readonly html: string }>('/api/theme/gallery-preview', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ theme }),
  })
}
