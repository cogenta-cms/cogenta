import { describe, expect, it } from 'vitest'
import { DEFAULT_ROUTES } from '../../src/pwa/strategy.js'
import {
  cacheNameFor,
  cachesToPurge,
  computeCacheVersion,
  parseCacheName,
} from '../../src/pwa/version.js'

const BASE = {
  offlineUrl: '/offline.html',
  precache: ['/offline.html'],
  routes: DEFAULT_ROUTES,
  buildId: 'abc123',
}

describe('deriving the cache generation', () => {
  it('gives the same inputs the same generation, so an unchanged deploy does not evict everything', () => {
    expect(computeCacheVersion(BASE)).toBe(computeCacheVersion({ ...BASE }))
  })

  it('changes generation when the build changes', () => {
    expect(computeCacheVersion({ ...BASE, buildId: 'def456' })).not.toBe(computeCacheVersion(BASE))
  })

  it('changes generation when a caching rule changes, not only when the content does', () => {
    const routes = DEFAULT_ROUTES.map((rule) =>
      rule.id === 'images' ? { ...rule, strategy: 'network-first' as const } : rule,
    )

    expect(computeCacheVersion({ ...BASE, routes })).not.toBe(computeCacheVersion(BASE))
  })

  it('changes generation when the offline page moves', () => {
    expect(computeCacheVersion({ ...BASE, offlineUrl: '/hors-ligne.html' })).not.toBe(
      computeCacheVersion(BASE),
    )
  })

  it('ignores the order of the precache list, which is a set and not a sequence', () => {
    const one = computeCacheVersion({ ...BASE, precache: ['/a', '/b'] })
    const other = computeCacheVersion({ ...BASE, precache: ['/b', '/a'] })

    expect(one).toBe(other)
  })
})

describe('purging previous generations', () => {
  const prefix = 'cogenta:pwa'
  const current = 'aaaa1111'

  it('deletes every cache of a previous generation', () => {
    const existing = [
      cacheNameFor(prefix, 'old00000', 'documents'),
      cacheNameFor(prefix, 'old00000', 'images'),
      cacheNameFor(prefix, current, 'documents'),
    ]

    expect(cachesToPurge(existing, prefix, current)).toEqual([
      'cogenta:pwa:old00000:documents',
      'cogenta:pwa:old00000:images',
    ])
  })

  it('keeps every cache of the current generation, including buckets this build no longer fills', () => {
    const existing = [cacheNameFor(prefix, current, 'legacy-bucket')]

    expect(cachesToPurge(existing, prefix, current)).toEqual([])
  })

  it('never touches a cache belonging to another application on the same origin', () => {
    const existing = [
      'workbox-precache-v2',
      'another-app:aaaa1111:documents',
      'cogenta:pwa:old00000:images',
    ]

    expect(cachesToPurge(existing, prefix, current)).toEqual(['cogenta:pwa:old00000:images'])
  })

  it('does not mistake a prefix that merely starts the same', () => {
    expect(cachesToPurge(['cogenta:pwa-preview:old:documents'], prefix, current)).toEqual([])
  })
})

describe('cache names', () => {
  it('round-trips through parsing', () => {
    const name = cacheNameFor('cogenta:pwa', 'aaaa1111', 'images')

    expect(parseCacheName(name, 'cogenta:pwa')).toEqual({
      prefix: 'cogenta:pwa',
      version: 'aaaa1111',
      bucket: 'images',
    })
  })

  it('refuses to parse a name that is not ours', () => {
    expect(parseCacheName('workbox-precache-v2', 'cogenta:pwa')).toBeNull()
    expect(parseCacheName('cogenta:pwa:incomplete', 'cogenta:pwa')).toBeNull()
  })
})
