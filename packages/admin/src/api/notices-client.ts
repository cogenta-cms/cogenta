import { authHeader, request } from './http.js'

/**
 * `/api/notices` — the admin's recommendations for whoever is signed in.
 *
 * The server sends codes and substitutions, never sentences: the interface is
 * translated (ADR-0019) and the server has no idea which language this browser
 * is in. `code` is what gets looked up; `params` is what fills the blanks.
 */

export type NoticeSeverity = 'info' | 'success' | 'warning' | 'danger'

export interface AdminNotice {
  readonly id: string
  readonly code: string
  readonly severity: NoticeSeverity
  readonly params?: Readonly<Record<string, string>>
  readonly dismissible: boolean
  readonly action?: { readonly code: string; readonly href: string }
}

export function listNotices(token: string): Promise<readonly AdminNotice[]> {
  return request('/api/notices', { headers: authHeader(token) })
}

export async function dismissNotice(token: string, id: string): Promise<void> {
  await request(`/api/notices/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST',
    headers: authHeader(token),
  })
}
