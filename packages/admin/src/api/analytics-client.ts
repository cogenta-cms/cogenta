import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/analytics/summary` and
 * `/api/analytics/page` — hand-mirrored from `@cogenta/analytics`'s
 * `AnalyticsSummary`/`PageStats`, same reason every other `*-client.ts` in
 * this directory copies its server-side shape by hand.
 */

export interface CountedPath {
  readonly path: string
  readonly views: number
  /** The entry's title and admin edit link, when `@cogenta/api`'s router could resolve one (fiche 27 task 1). Absent for a path no route matches any more. */
  readonly title?: string
  readonly editHref?: string
}

export interface CountedReferrer {
  readonly domain: string
  readonly views: number
}

export type DeviceCategory = 'desktop' | 'mobile' | 'tablet' | 'other'

export interface CountedDevice {
  readonly device: DeviceCategory
  readonly views: number
}

export interface DailyViews {
  readonly day: string
  readonly views: number
}

export interface AnalyticsSummary {
  readonly since: string
  readonly until: string
  readonly totalViews: number
  readonly uniqueVisitors: number
  readonly topPages: readonly CountedPath[]
  readonly topReferrers: readonly CountedReferrer[]
  readonly deviceBreakdown: readonly CountedDevice[]
  readonly dailyViews: readonly DailyViews[]
  readonly previousTotalViews: number
  readonly previousUniqueVisitors: number
  readonly viewsChangePercent: number | null
  /** The site's configured events retention in days, or `null` if none was wired in (fiche 27 task 3). */
  readonly retentionDays: number | null
}

export interface PageStats {
  readonly path: string
  readonly since: string
  readonly until: string
  readonly views: number
  readonly previousViews: number
  readonly changePercent: number | null
  readonly rank: number | null
  readonly rankedPages: number
}

/** Either a fixed window (`days`) or a custom range (`since`/`until`, both required together) — never both. */
export type AnalyticsWindow =
  | { readonly days: number }
  | { readonly since: string; readonly until: string }

function windowQuery(window: AnalyticsWindow): string {
  return 'days' in window
    ? `days=${window.days}`
    : `since=${encodeURIComponent(window.since)}&until=${encodeURIComponent(window.until)}`
}

/** Admin-only on the server; a non-admin caller gets `ApiError` with a 403. */
export function getAnalyticsSummary(
  token: string,
  window: AnalyticsWindow = { days: 30 },
): Promise<AnalyticsSummary> {
  return request(`/api/analytics/summary?${windowQuery(window)}`, { headers: authHeader(token) })
}

/** Views, trend and rank for one page — what the entry-editor sidebar shows (fiche 27 task 2). Admin-only, same as the summary. */
export function getAnalyticsPageStats(
  token: string,
  path: string,
  window: AnalyticsWindow = { days: 30 },
): Promise<PageStats> {
  return request(`/api/analytics/page?path=${encodeURIComponent(path)}&${windowQuery(window)}`, {
    headers: authHeader(token),
  })
}
