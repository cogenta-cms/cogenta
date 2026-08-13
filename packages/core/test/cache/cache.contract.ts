import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CacheDriver } from '../../src/cache/index.js'

/** A clock the suite can move, so TTL tests never sleep. */
export interface TestClock {
  now(): number
  advance(seconds: number): void
}

export function createTestClock(start = 1_700_000_000_000): TestClock {
  let current = start
  return {
    now: () => current,
    advance: (seconds) => {
      current += seconds * 1000
    },
  }
}

export interface CacheContractHarness {
  readonly cache: CacheDriver
  dispose?(): Promise<void>
}

/**
 * The single contract suite for `CacheDriver`. Every implementation runs **this**
 * file — never a copy adapted to what that driver happens to do. A behaviour
 * only one driver honours is a leaky abstraction, and this is where it surfaces.
 */
export function runCacheContract(
  name: string,
  create: (clock: TestClock) => Promise<CacheContractHarness> | CacheContractHarness,
): void {
  describe(`CacheDriver contract — ${name}`, () => {
    let clock: TestClock
    let harness: CacheContractHarness
    let cache: CacheDriver

    beforeEach(async () => {
      clock = createTestClock()
      harness = await create(clock)
      cache = harness.cache
      await cache.clear()
    })

    afterEach(async () => {
      await cache.clear()
      await harness.dispose?.()
    })

    describe('get and set', () => {
      it('returns what was stored', async () => {
        await cache.set('page:home', { title: 'Home' })

        expect(await cache.get('page:home')).toEqual({ title: 'Home' })
      })

      it('returns null for a key that was never set', async () => {
        expect(await cache.get('page:missing')).toBeNull()
      })

      it('overwrites a previous value', async () => {
        await cache.set('k', 'first')
        await cache.set('k', 'second')

        expect(await cache.get('k')).toBe('second')
      })

      it('round-trips every JSON shape a caller might cache', async () => {
        const value = {
          text: 'a',
          number: 42,
          float: 1.5,
          truth: true,
          nothing: null,
          list: [1, 'two', { three: 3 }],
          nested: { deep: { deeper: ['x'] } },
        }
        await cache.set('shapes', value)

        expect(await cache.get('shapes')).toEqual(value)
      })

      it('distinguishes a stored null from a missing key', async () => {
        // Both are falsy. Conflating them makes a cache return misses forever
        // for anything legitimately cached as null.
        await cache.set('stored-null', null)

        expect(await cache.get('stored-null')).toBeNull()
        expect(await cache.get('never-set')).toBeNull()
      })

      it('does not hand back a reference the caller can mutate', async () => {
        const value = { list: [1, 2] }
        await cache.set('shared', value)

        const first = await cache.get<{ list: number[] }>('shared')
        first?.list.push(3)

        expect(await cache.get('shared')).toEqual({ list: [1, 2] })
      })

      it('accepts keys with Unicode, slashes and unusual characters', async () => {
        const keys = ['page:/blog/été', 'clé:naïve', 'a b:c/d\\e', '日本語:キー', 'x'.repeat(300)]

        for (const [index, key] of keys.entries()) await cache.set(key, index)
        for (const [index, key] of keys.entries()) expect(await cache.get(key)).toBe(index)
      })

      it('does not confuse two keys that only differ at the end', async () => {
        await cache.set('page:home', 'a')
        await cache.set('page:home2', 'b')

        expect(await cache.get('page:home')).toBe('a')
      })

      it('handles a value large enough to exercise buffering', async () => {
        const big = { body: 'x'.repeat(200_000) }
        await cache.set('big', big)

        expect(await cache.get('big')).toEqual(big)
      })

      it('refuses an empty key rather than storing it somewhere odd', async () => {
        await expect(cache.set('', 'x')).rejects.toThrowError()
      })

      it('refuses a value that cannot be serialised', async () => {
        await expect(cache.set('bad', () => undefined)).rejects.toThrowError()
        await expect(cache.set('bad', 10n)).rejects.toThrowError()
      })
    })

    describe('delete', () => {
      it('removes the entry', async () => {
        await cache.set('k', 'v')
        await cache.delete('k')

        expect(await cache.get('k')).toBeNull()
      })

      it('is silent about a key that was never there', async () => {
        await expect(cache.delete('never-set')).resolves.toBeUndefined()
      })
    })

    describe('ttl', () => {
      it('keeps an entry that has not expired', async () => {
        await cache.set('k', 'v', { ttl: 60 })
        clock.advance(59)

        expect(await cache.get('k')).toBe('v')
      })

      it('drops an entry once its ttl has passed', async () => {
        await cache.set('k', 'v', { ttl: 60 })
        clock.advance(61)

        expect(await cache.get('k')).toBeNull()
      })

      it('treats the exact expiry instant as expired', async () => {
        await cache.set('k', 'v', { ttl: 60 })
        clock.advance(60)

        expect(await cache.get('k')).toBeNull()
      })

      it('keeps an entry with no ttl indefinitely', async () => {
        await cache.set('k', 'v')
        clock.advance(60 * 60 * 24 * 365)

        expect(await cache.get('k')).toBe('v')
      })

      it('resets the ttl when the key is written again', async () => {
        await cache.set('k', 'v', { ttl: 60 })
        clock.advance(50)
        await cache.set('k', 'v2', { ttl: 60 })
        clock.advance(50)

        expect(await cache.get('k')).toBe('v2')
      })

      it('refuses a ttl that is zero or negative', async () => {
        await expect(cache.set('k', 'v', { ttl: 0 })).rejects.toThrowError()
        await expect(cache.set('k', 'v', { ttl: -1 })).rejects.toThrowError()
      })
    })

    describe('tag invalidation', () => {
      it('drops every entry carrying the tag', async () => {
        await cache.set('a', 1, { tags: ['article:7'] })
        await cache.set('b', 2, { tags: ['article:7'] })
        await cache.set('c', 3, { tags: ['article:8'] })

        await cache.invalidateTags(['article:7'])

        expect(await cache.get('a')).toBeNull()
        expect(await cache.get('b')).toBeNull()
        expect(await cache.get('c')).toBe(3)
      })

      it('drops an entry that carries any one of several tags', async () => {
        await cache.set('page', 'v', { tags: ['article:7', 'author:3'] })

        await cache.invalidateTags(['author:3'])

        expect(await cache.get('page')).toBeNull()
      })

      it('invalidates several tags in one call', async () => {
        await cache.set('a', 1, { tags: ['x'] })
        await cache.set('b', 2, { tags: ['y'] })

        await cache.invalidateTags(['x', 'y'])

        expect(await cache.get('a')).toBeNull()
        expect(await cache.get('b')).toBeNull()
      })

      it('is silent about a tag nothing carries', async () => {
        await expect(cache.invalidateTags(['nobody'])).resolves.toBeUndefined()
      })

      it('forgets the old tags when a key is rewritten', async () => {
        await cache.set('k', 'v1', { tags: ['old'] })
        await cache.set('k', 'v2', { tags: ['new'] })

        await cache.invalidateTags(['old'])

        expect(await cache.get('k')).toBe('v2')
      })

      it('stops tracking a key that was deleted', async () => {
        await cache.set('k', 'v', { tags: ['t'] })
        await cache.delete('k')
        await cache.set('k', 'v2')

        await cache.invalidateTags(['t'])

        expect(await cache.get('k')).toBe('v2')
      })

      it('accepts tags with the same awkward characters as keys', async () => {
        await cache.set('k', 'v', { tags: ['catégorie:actualités/2026'] })

        await cache.invalidateTags(['catégorie:actualités/2026'])

        expect(await cache.get('k')).toBeNull()
      })
    })

    describe('clear', () => {
      it('empties everything, tags included', async () => {
        await cache.set('a', 1, { tags: ['t'] })
        await cache.set('b', 2)

        await cache.clear()

        expect(await cache.get('a')).toBeNull()
        expect(await cache.get('b')).toBeNull()
      })

      it('leaves the cache usable afterwards', async () => {
        await cache.set('a', 1)
        await cache.clear()
        await cache.set('a', 2)

        expect(await cache.get('a')).toBe(2)
      })

      it('is safe to call on an empty cache, twice', async () => {
        await cache.clear()
        await expect(cache.clear()).resolves.toBeUndefined()
      })
    })

    describe('concurrency', () => {
      it('survives concurrent writes to the same key with one of them winning', async () => {
        await Promise.all(Array.from({ length: 20 }, (_, i) => cache.set('hot', i)))

        expect(await cache.get<number>('hot')).toBeTypeOf('number')
      })

      it('keeps concurrent writes to different keys independent', async () => {
        await Promise.all(Array.from({ length: 20 }, (_, i) => cache.set(`k${i}`, i)))

        const values = await Promise.all(
          Array.from({ length: 20 }, (_, i) => cache.get<number>(`k${i}`)),
        )
        expect(values).toEqual(Array.from({ length: 20 }, (_, i) => i))
      })
    })
  })
}
