import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/analytics/summary` — hand-mirrored from
 * `@cogenta/analytics`'s `AnalyticsSummary`, same reason every other
 * `*-client.ts` in this directory copies its server-side shape by hand.
 */

export interface CountedPath {
  readonly path: string
  readonly views: number
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
}

/** Admin-only on the server; a non-admin caller gets `ApiError` with a 403. */
export function getAnalyticsSummary(token: string, days = 30): Promise<AnalyticsSummary> {
  return request(`/api/analytics/summary?days=${days}`, { headers: authHeader(token) })
}
