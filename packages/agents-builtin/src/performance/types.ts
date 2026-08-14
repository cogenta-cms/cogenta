/** p75 Core Web Vitals from CrUX field data — a field absent means CrUX has no data for that metric (not enough real-user traffic), not an error. */
export interface CruxMetrics {
  readonly lcpP75Ms?: number
  readonly clsP75?: number
  readonly inpP75Ms?: number
  readonly ttfbP75Ms?: number
}

export type PerformanceSeverity = 'error' | 'warning' | 'info'

/** Kept decoupled from `SeoFinding` — same severity-tagged-finding shape, different domain, no cross-domain coupling for its own sake. */
export interface PerformanceFinding {
  readonly check: string
  readonly severity: PerformanceSeverity
  readonly message: string
}

export interface PerformanceBudget {
  readonly lcpMs?: number
  readonly clsScore?: number
  readonly inpMs?: number
  readonly ttfbMs?: number
}

export interface PerformanceImage {
  readonly width?: number
  readonly height?: number
  readonly sizeBytes?: number
  /** e.g. 'jpeg' | 'png' | 'webp' | 'avif' — whatever the media store reports. */
  readonly format?: string
}

/**
 * Deliberately not `@cogenta/blocks`' own entry/media types — same
 * narrow-structural-interface reasoning as `ContentServiceLike` (L4 task 5)
 * and `SeoPageInput` (L5 task 5). Only the fields a structural risk scan can
 * honestly use.
 */
export interface PerformancePageInput {
  readonly url: string
  readonly images: readonly PerformanceImage[]
  readonly thirdPartyScriptUrls: readonly string[]
}
