import { authHeader, request } from './http.js'

/**
 * `/api/seo/search-console` — fiche 70 task 4, ADR-0032. Shapes hand-mirrored
 * from `@cogenta/api`'s `search-console-router.ts`, the same reason every
 * other `*-client.ts` here copies its server-side shape by hand.
 */

export interface SearchConsoleStatus {
  readonly configured: boolean
  readonly connected: boolean
  readonly siteUrl?: string
  readonly connectedAt?: string
  readonly updatedAt?: string
}

export function getSearchConsoleStatus(token: string): Promise<SearchConsoleStatus> {
  return request<SearchConsoleStatus>('/api/seo/search-console/status', {
    headers: authHeader(token),
  })
}

export interface SearchConsoleAuthorization {
  readonly url: string
}

/** The URL to send the browser to (`window.location.href = url`) — never fetched by this client itself, since completing the flow means leaving the SPA. */
export function getSearchConsoleAuthorizeUrl(token: string): Promise<SearchConsoleAuthorization> {
  return request<SearchConsoleAuthorization>('/api/seo/search-console/authorize', {
    headers: authHeader(token),
  })
}

export interface SearchConsoleMetricRow {
  readonly page: string
  readonly clicks: number
  readonly impressions: number
  readonly ctr: number
  readonly position: number
}

export interface SearchConsoleMetrics {
  readonly siteUrl: string
  readonly windowDays: number
  readonly rows: readonly SearchConsoleMetricRow[]
}

export function getSearchConsoleMetrics(token: string): Promise<SearchConsoleMetrics> {
  return request<SearchConsoleMetrics>('/api/seo/search-console/metrics', {
    headers: authHeader(token),
  })
}

export async function disconnectSearchConsole(token: string): Promise<void> {
  await request('/api/seo/search-console/disconnect', {
    method: 'POST',
    headers: authHeader(token),
  })
}
