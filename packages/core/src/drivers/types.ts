/**
 * `optimal` needs an external service. `degraded` needs nothing beyond Node and
 * the filesystem. Rule R1: every infrastructure need has at least one of each,
 * so the default install has no external dependency at all.
 */
export type DriverTier = 'optimal' | 'degraded'

export const DRIVER_TIERS: readonly DriverTier[] = ['optimal', 'degraded']

export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface HealthReport {
  readonly status: HealthStatus
  readonly driver: string
  readonly tier: DriverTier
  readonly latencyMs?: number
  /** Plain sentence for the admin. Must never contain a credential. */
  readonly message?: string
  readonly details?: Readonly<Record<string, unknown>>
}

/**
 * One implementation of an infrastructure need.
 *
 * `available()` answers "does the service actually answer?" — not "is a URL
 * configured?". Getting that wrong turns a fallback into a startup crash.
 */
export interface Driver<TInstance, TConfig> {
  readonly name: string
  readonly tier: DriverTier
  available(config: TConfig): Promise<boolean>
  init(config: TConfig): Promise<TInstance>
  dispose(): Promise<void>
  health(): Promise<HealthReport>
}

export interface SkippedDriver {
  readonly driver: string
  readonly tier: DriverTier
  readonly reason: string
}

/**
 * The outcome of a selection. `reason` and `skipped` exist so `cogenta doctor`
 * and the admin can state what is running and why — "job queue: database
 * (degraded), because Redis is absent". That is a product requirement, not a
 * debugging aid.
 */
export interface DriverSelection<TInstance> {
  readonly need: string
  readonly driver: string
  readonly tier: DriverTier
  readonly instance: TInstance
  /** True when the configuration named this driver, rather than leaving it to us. */
  readonly requested: boolean
  readonly reason: string
  readonly skipped: readonly SkippedDriver[]
  dispose(): Promise<void>
  health(): Promise<HealthReport>
}

/** Any config section that may name a driver. `auto` names nothing. */
export interface DriverChoice {
  readonly driver?: string
}
