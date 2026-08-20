import type { DeviceCategory } from './device.js'

export interface AnalyticsEvent {
  readonly id: string
  readonly at: string
  readonly path: string
  readonly referrerDomain: string | undefined
  readonly device: DeviceCategory
  readonly sessionHash: string
}

/**
 * What the beacon route hands the store. `ip` and `userAgent` are consumed to
 * derive `sessionHash`/`device` and are never themselves persisted — see
 * `session-hash.ts` and `device.ts`.
 */
export interface RecordEventInput {
  readonly path: string
  readonly referrer?: string | null | undefined
  readonly userAgent?: string | null | undefined
  readonly ip: string
  /** The site's own hostname, so a same-site referrer is not recorded as one. */
  readonly siteHost?: string | null | undefined
}

export interface RecordEventResult {
  /** `false` when the event was dropped — invalid path, or rate-limited. Never throws for a public beacon. */
  readonly recorded: boolean
}

export interface SummaryOptions {
  readonly since: Date
  readonly until?: Date
  /** How many rows in each top-N breakdown. Defaults to 10. */
  readonly limit?: number
}

export interface PageStatsOptions {
  /** The exact stored path, e.g. `/blog/hello-world` — never a prefix or a pattern. */
  readonly path: string
  readonly since: Date
  readonly until?: Date
}

export interface CountedPath {
  readonly path: string
  readonly views: number
}

export interface CountedReferrer {
  readonly domain: string
  readonly views: number
}

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
  /**
   * Distinct session hashes in the window. Because the hash is salted fresh
   * every day (`session-hash.ts`), the same real visitor on two different
   * days counts as two unique visitors here — an intentional, documented
   * over-count that is the price of never storing anything that could link
   * one day's traffic to the next.
   */
  readonly uniqueVisitors: number
  readonly topPages: readonly CountedPath[]
  readonly topReferrers: readonly CountedReferrer[]
  readonly deviceBreakdown: readonly CountedDevice[]
  readonly dailyViews: readonly DailyViews[]
  /**
   * The equal-length window immediately before `since` — the comparison
   * baseline a "vs. previous period" display needs (fiche 27 task 1). Same
   * over-count caveat as `uniqueVisitors` above: the daily salt makes a
   * cross-window unique count exact only *within* one window, not across two.
   */
  readonly previousTotalViews: number
  readonly previousUniqueVisitors: number
  /**
   * `(totalViews - previousTotalViews) / previousTotalViews * 100`, or `null`
   * when there is no previous traffic to compare against — a page with 0
   * views last period and 5 this period has no meaningful percentage, and
   * reporting `0%` would say "no change" about what is actually "brand new".
   */
  readonly viewsChangePercent: number | null
}

export interface PageStats {
  readonly path: string
  readonly since: string
  readonly until: string
  readonly views: number
  readonly previousViews: number
  readonly changePercent: number | null
  /**
   * This path's 1-based rank by view count among every path seen in the
   * window, or `null` when the path itself had zero views in it (there is
   * nothing to rank).
   */
  readonly rank: number | null
  /** How many distinct paths were seen in the window — `rank`'s denominator. */
  readonly rankedPages: number
}
