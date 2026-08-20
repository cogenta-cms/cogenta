import { authHeader, request } from './http.js'

/**
 * `GET|PATCH /api/settings` — the editorial site settings a rédacteur can
 * change without a terminal (fiche 23, ADR-0025's third category).
 *
 * Read needs no token: an anonymous visitor's browser never calls this
 * directly, but the admin's own settings screen loads before it necessarily
 * knows whether the signed-in account can write anything, and the site
 * settings provider (`site-settings-context.tsx`) that feeds every screen's
 * date formatting reads this once at startup the same way `SchemaProvider`
 * reads `/api/schema`.
 */

export type SiteSettingGroup =
  | 'general'
  | 'reading'
  | 'discussion'
  | 'media'
  | 'privacy'
  | 'commerce'
export type SiteSettingScope = 'site' | 'locale'

export interface SiteSetting {
  readonly key: string
  readonly group: SiteSettingGroup
  readonly order: number
  readonly uiType: string
  readonly options: readonly { readonly value: string; readonly label: string }[] | undefined
  readonly scope: SiteSettingScope
  readonly locale: string | null
  readonly value: unknown
  readonly isDefault: boolean
  readonly updatedAt: string | null
  readonly updatedBy: string | null
}

export function listSettings(locale?: string): Promise<readonly SiteSetting[]> {
  const query = locale === undefined ? '' : `?locale=${encodeURIComponent(locale)}`
  return request(`/api/settings${query}`)
}

export function writeSetting(
  token: string,
  key: string,
  value: unknown,
  locale?: string,
): Promise<SiteSetting> {
  const query = locale === undefined ? '' : `?locale=${encodeURIComponent(locale)}`
  return request(`/api/settings${query}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ key, value }),
  })
}
