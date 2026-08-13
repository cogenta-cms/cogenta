import type { CacheBucket, PwaConfig } from './types.js'

/**
 * Cache naming and generational purge.
 *
 * A cache name carries its generation: `cogenta:pwa:3f2a91cc:images`. That one
 * decision is what makes the purge trivial and total — "delete every cache of
 * mine whose generation is not the current one" needs no bookkeeping, no
 * manifest of what was stored, and no per-entry expiry. Caches from a deploy
 * three versions ago cannot survive, because their name says so.
 *
 * The alternative — one cache reused across deploys, entries expired by age —
 * is the design that produces the incident this module exists to prevent: the
 * cache still holds last month's HTML and nothing in the system knows it.
 */

/** Separator between the prefix, the version and the bucket. */
const SEPARATOR = ':'

export const DEFAULT_CACHE_PREFIX = 'cogenta:pwa'

/**
 * FNV-1a, 32 bits. Not `node:crypto`: this helper is also used from the edge
 * build target, where the Node crypto module may be absent. The hash is a cache
 * generation marker, never a security boundary — a collision costs a stale
 * asset, not an exploit.
 */
function hash(input: string): string {
  let value = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value.toString(16).padStart(8, '0')
}

/**
 * Derives the cache generation from everything that changes how a response is
 * produced or stored: the offline page, the precache list and the whole route
 * table. Editing a rule therefore invalidates the caches that rule filled,
 * which is the case people forget when they version by build number alone.
 *
 * `buildId` is whatever the deployment already has — a commit sha, a build
 * timestamp. Passing it is what makes a content change bump the generation.
 */
export function computeCacheVersion(
  input: Pick<PwaConfig, 'offlineUrl' | 'precache' | 'routes'> & { readonly buildId?: string },
): string {
  const material = JSON.stringify([
    input.buildId ?? '',
    input.offlineUrl,
    [...input.precache].sort(),
    input.routes,
  ])
  return hash(material)
}

/**
 * Builds a cache name.
 *
 * Inlined verbatim into the generated service worker (see `runtime-source.ts`),
 * so it must stay free of any reference to module scope.
 */
export function cacheNameFor(prefix: string, version: string, bucket: string): string {
  return `${prefix}:${version}:${bucket}`
}

/**
 * Selects the caches to delete at activation: ours, and not of this generation.
 *
 * Two properties matter and both are tested. Caches belonging to another
 * application on the same origin are never returned — a purge that deletes a
 * neighbour's cache is a far worse incident than the one it fixes. And a cache
 * of the current generation is never returned, including when the bucket is one
 * this build no longer uses, because the fetch handler may be filling it right
 * now.
 *
 * Inlined verbatim into the generated service worker: no module-scope
 * references allowed.
 */
export function cachesToPurge(
  existing: readonly string[],
  prefix: string,
  version: string,
): string[] {
  const mine = `${prefix}:`
  const current = `${prefix}:${version}:`
  return existing.filter((name) => name.startsWith(mine) && !name.startsWith(current))
}

/** Parsed form of a cache name we own. `null` for anything that is not ours. */
export interface ParsedCacheName {
  readonly prefix: string
  readonly version: string
  readonly bucket: string
}

export function parseCacheName(name: string, prefix: string): ParsedCacheName | null {
  if (!name.startsWith(`${prefix}${SEPARATOR}`)) return null
  const rest = name.slice(prefix.length + SEPARATOR.length)
  const cut = rest.indexOf(SEPARATOR)
  if (cut <= 0 || cut === rest.length - 1) return null
  return { prefix, version: rest.slice(0, cut), bucket: rest.slice(cut + 1) }
}

/** Typed convenience over `cacheNameFor` for call sites that know the bucket. */
export function bucketCacheName(config: PwaConfig, bucket: CacheBucket): string {
  return cacheNameFor(config.cachePrefix, config.version, bucket)
}
