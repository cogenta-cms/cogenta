import { authHeader, request } from './http.js'

/**
 * `GET|PATCH /api/settings` — the editorial site settings a rédacteur can
 * change without a terminal (fiche 23, ADR-0025's third category).
 *
 * Pass a session token for administrative settings. Anonymous consumers (login
 * branding and public date formatting) receive only the public settings.
 */

export type SiteSettingGroup =
  | 'general'
  | 'reading'
  | 'discussion'
  | 'media'
  | 'privacy'
  | 'commerce'
  | 'branding'
  | 'seo'
  | 'observability'
  | 'assistant'
  | 'updates'
  | 'navigation'
  | 'channels'
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

export function listSettings(locale?: string, token?: string): Promise<readonly SiteSetting[]> {
  const query = locale === undefined ? '' : `?locale=${encodeURIComponent(locale)}`
  return request(`/api/settings${query}`, {
    ...(token === undefined ? {} : { headers: authHeader(token) }),
  })
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
