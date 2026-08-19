/**
 * A per-key request quota (fiche 20, task 3: "Limitation de débit par clé").
 *
 * Drawn from the driver with the least — a single Node process, no external
 * service — the same way `CacheDriver` was: a fixed window counter needs
 * nothing but an atomic increment and an expiry, and that is exactly what
 * both an in-process `Map` and Redis's `INCR`/`PEXPIRE` give for free. A
 * sliding-window or token-bucket algorithm would read nicer but cannot be
 * expressed in one round trip against Redis without a Lua script — a
 * dependency this driver does not need to take (rule R9).
 */
export interface RateLimitConsumeOptions {
  /** Maximum requests allowed inside one window. */
  readonly limit: number
  /** Window length, in milliseconds. */
  readonly windowMs: number
}

export interface RateLimitResult {
  /** `count <= limit` for this call. */
  readonly allowed: boolean
  readonly limit: number
  /** `max(0, limit - count)`, after this call was counted. */
  readonly remaining: number
  /** Unix milliseconds when the current window ends and the count resets. */
  readonly resetAt: number
}

/**
 * A counter, keyed by an arbitrary string, that answers "has this key stayed
 * under its quota during the current window?" — nothing else. It is
 * deliberately not a cache: there is no `get` that returns a stored value,
 * only `consume`, which always counts the call it is answering for.
 */
export interface RateLimitDriver {
  consume(key: string, options: RateLimitConsumeOptions): Promise<RateLimitResult>
  /**
   * Clears one key's counter for the window it would currently be counted
   * in — a revoked or rotated credential should not inherit a stale count.
   * `windowMs` must match the value `consume` is called with for this key,
   * since it is part of how a windowed driver (Redis) names the bucket.
   */
  reset(key: string, windowMs: number): Promise<void>
}

/** The resolved `rateLimit` section of the configuration. */
export interface RateLimitConfig {
  readonly driver?: string
  readonly url?: string | undefined
}

export interface RateLimitDriverOptions {
  /** Injected so tests can move the window without waiting. Milliseconds. */
  readonly now?: () => number
}
