export interface CacheSetOptions {
  /** Seconds. Absent means "until invalidated". */
  readonly ttl?: number
  /** Labels this entry belongs to, for bulk invalidation. */
  readonly tags?: readonly string[]
}

/**
 * A key/value cache.
 *
 * `invalidateTags` is **mandatory in every implementation**, including the ones
 * with no server behind them. Content caching is only correct if a publish can
 * drop every page that embedded the changed content; bolting that on later means
 * rewriting each driver, so it is part of the interface from the first day.
 *
 * Values round-trip through serialisation in every driver, including `memory`.
 * Handing back a live reference would let a caller mutate the cache by accident
 * on one driver and not on another — the kind of divergence that only shows up
 * in production, on the driver you did not develop against.
 */
export interface CacheDriver {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>
  delete(key: string): Promise<void>
  invalidateTags(tags: readonly string[]): Promise<void>
  clear(): Promise<void>
}

/** The resolved `cache` section of the configuration. */
export interface CacheConfig {
  readonly driver?: string
  readonly url?: string | undefined
  readonly path?: string
}

export interface CacheDriverOptions {
  /** Injected so tests can expire entries without waiting. Milliseconds. */
  readonly now?: () => number
}
