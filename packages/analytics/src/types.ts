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
}
