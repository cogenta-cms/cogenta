import { CogentaError } from '../errors/index.js'

/**
 * The envelope every driver stores: the value plus what is needed to expire and
 * invalidate it. Identical across drivers, so an entry written by one is
 * readable by another — which is what makes the contract suite meaningful.
 */
export interface CacheEntry {
  readonly value: unknown
  /** Epoch milliseconds, or `null` for "no expiry". */
  readonly expiresAt: number | null
  readonly tags: readonly string[]
}

export function assertKey(key: string): void {
  if (key.length === 0) {
    throw new CogentaError({
      code: 'CACHE_FAILED',
      message: 'A cache key must not be empty.',
      hint: 'Build the key from something stable, such as "page:" plus the locale and the slug.',
    })
  }
}

export function expiryFrom(ttl: number | undefined, now: number): number | null {
  if (ttl === undefined) return null

  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new CogentaError({
      code: 'CACHE_FAILED',
      message: `A cache TTL must be a positive number of seconds, received ${String(ttl)}.`,
      hint: 'Omit the ttl option for an entry that lives until it is invalidated.',
    })
  }
  return now + ttl * 1000
}

export function isExpired(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && expiresAt <= now
}

/**
 * Round-trips a value through JSON, which is what the file and Redis drivers do
 * anyway. Doing it in `memory` too is what keeps the three drivers substitutable:
 * a caller must not be able to mutate a cached object by keeping the reference.
 */
export function serialise(value: unknown): string {
  let raw: string | undefined
  try {
    raw = JSON.stringify(value ?? null)
  } catch (error) {
    throw unserialisable(error)
  }

  // `JSON.stringify` returns undefined — it does not throw — for a function or a
  // symbol. Left unchecked that caches the string "undefined" and hands it back
  // on the next read, so the failure surfaces far from its cause.
  if (raw === undefined) throw unserialisable(undefined)
  return raw
}

function unserialisable(cause: unknown): CogentaError {
  return new CogentaError({
    code: 'CACHE_FAILED',
    message: 'This value cannot be cached: it is not serialisable to JSON.',
    hint: 'Cache plain data. Functions, symbols, class instances and BigInt do not survive any cache driver.',
    ...(cause === undefined ? {} : { cause }),
  })
}

export function deserialise(raw: string): unknown {
  return JSON.parse(raw)
}

/**
 * Encodes an entry for any driver that stores it as one blob.
 *
 * The value is serialised **first, on its own**. Serialising the whole envelope
 * in one go would let `JSON.stringify` drop an unserialisable value silently —
 * a function becomes a missing property rather than an error — and the caller
 * would only find out on the next read, far from the cause.
 */
export function encodeEntry(
  value: unknown,
  expiresAt: number | null,
  tags: readonly string[],
): string {
  const encodedValue = serialise(value)
  return `{"value":${encodedValue},"expiresAt":${JSON.stringify(expiresAt)},"tags":${JSON.stringify(tags)}}`
}

export function decodeEntry(raw: string): CacheEntry {
  return JSON.parse(raw) as CacheEntry
}
