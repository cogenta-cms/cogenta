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

/**
 * `/api/notices/history` — fiche 38 task 2's notification centre: what has
 * ever been shown to this person, resolved or not, dismissed or not.
 */
export interface NoticeHistoryEntry {
  readonly id: string
  readonly code: string
  readonly severity: NoticeSeverity
  readonly params: Readonly<Record<string, string>>
  readonly action?: { readonly code: string; readonly href: string }
  readonly dismissible: boolean
  readonly firstSeenAt: string
  readonly lastSeenAt: string
  readonly resolvedAt: string | null
  readonly readAt: string | null
}

export interface NoticeHistoryFilter {
  readonly severity?: NoticeSeverity
  readonly since?: string
  readonly until?: string
}

export function listNoticeHistory(
  token: string,
  filter: NoticeHistoryFilter = {},
): Promise<readonly NoticeHistoryEntry[]> {
  const params = new URLSearchParams()
  if (filter.severity !== undefined) params.set('severity', filter.severity)
  if (filter.since !== undefined) params.set('since', filter.since)
  if (filter.until !== undefined) params.set('until', filter.until)
  const query = params.toString()
  return request(`/api/notices/history${query.length > 0 ? `?${query}` : ''}`, {
    headers: authHeader(token),
  })
}

export async function markNoticesRead(
  token: string,
  ids: readonly string[] | 'all',
): Promise<void> {
  await request('/api/notices/read', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(ids === 'all' ? { all: true } : { ids }),
  })
}

/**
 * `/api/notices/channels` — fiche 38 tasks 3-4: linking a channel to receive
 * notices, and per-channel preferences.
 */
export interface LinkedChannel {
  readonly channelName: string
  readonly channelUserId: string
  readonly linkedAt: string
}

export function listLinkedChannels(token: string): Promise<readonly LinkedChannel[]> {
  return request('/api/notices/channels', { headers: authHeader(token) })
}

export function generateChannelLinkCode(
  token: string,
  channelName: string,
): Promise<{ readonly code: string; readonly expiresAt: string }> {
  return request(`/api/notices/channels/${encodeURIComponent(channelName)}/link-code`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export async function revokeChannelLink(token: string, channelName: string): Promise<void> {
  await request(`/api/notices/channels/${encodeURIComponent(channelName)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export type ChannelGrouping = 'immediate' | 'hourly' | 'daily'
export type ChannelMinSeverity = 'info' | 'warning' | 'critical'

export interface ChannelPreferences {
  readonly eventTypes: readonly string[]
  readonly minSeverity: ChannelMinSeverity
  readonly quietHours: { readonly startMinute: number; readonly endMinute: number } | null
  readonly grouping: ChannelGrouping
}

export function getChannelPreferences(
  token: string,
  channelName: string,
): Promise<ChannelPreferences> {
  return request(`/api/notices/channels/${encodeURIComponent(channelName)}/preferences`, {
    headers: authHeader(token),
  })
}

export function setChannelPreferences(
  token: string,
  channelName: string,
  preferences: ChannelPreferences,
): Promise<ChannelPreferences> {
  return request(`/api/notices/channels/${encodeURIComponent(channelName)}/preferences`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify(preferences),
  })
}
