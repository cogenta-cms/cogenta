import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createRedirectPatternStore,
  type RedirectPatternStore,
} from '../../src/routing/redirect-patterns.js'

/**
 * Prefix redirects — `/blog/*` to `/actualites/*` (fiche 12 task 4). No
 * regular expression ever enters this: matching is a plain `startsWith`,
 * which is the property that keeps a user-supplied pattern out of the
 * catastrophic-backtracking class of bug entirely, not merely unlikely to
 * hit it.
 */

describe('prefix redirects', () => {
  let db: DatabaseHandle
  let store: RedirectPatternStore

  beforeEach(async () => {
    db = await createSqliteHandle({ url: ':memory:' })
    store = createRedirectPatternStore({ db })
  })

  afterEach(async () => {
    await db.close()
  })

  it('rewrites the prefix, keeping the rest of the path', async () => {
    await store.add({ fromPrefix: '/blog/*', toPrefix: '/actualites/*' })

    await expect(store.resolve('/blog/mon-article')).resolves.toEqual({
      to: '/actualites/mon-article',
      status: 301,
    })
  })

  it('redirects the bare prefix itself, with no trailing slash left dangling', async () => {
    await store.add({ fromPrefix: '/blog/*', toPrefix: '/actualites/*' })

    await expect(store.resolve('/blog')).resolves.toEqual({ to: '/actualites', status: 301 })
  })

  it('answers nothing for a path the prefix does not cover', async () => {
    await store.add({ fromPrefix: '/blog/*', toPrefix: '/actualites/*' })

    await expect(store.resolve('/shop/item')).resolves.toBeNull()
  })

  it('prefers the most specific of two overlapping prefixes', async () => {
    await store.add({ fromPrefix: '/blog/*', toPrefix: '/actualites/*' })
    await store.add({ fromPrefix: '/blog/archive/*', toPrefix: '/vieux-articles/*' })

    await expect(store.resolve('/blog/archive/2020/post')).resolves.toEqual({
      to: '/vieux-articles/2020/post',
      status: 301,
    })
    await expect(store.resolve('/blog/2020/post')).resolves.toEqual({
      to: '/actualites/2020/post',
      status: 301,
    })
  })

  it('refuses a prefix that redirects to itself', async () => {
    await expect(store.add({ fromPrefix: '/blog/*', toPrefix: '/blog/*' })).rejects.toMatchObject({
      code: 'CONTENT_REDIRECT_LOOP',
    })
  })

  it('replaces a rule rather than keeping two for the same prefix', async () => {
    await store.add({ fromPrefix: '/blog/*', toPrefix: '/a/*' })
    await store.add({ fromPrefix: '/blog/*', toPrefix: '/b/*' })

    const rows = await store.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ toPrefix: '/b/' })
  })

  it('accepts a temporary (302) prefix redirect', async () => {
    await store.add({ fromPrefix: '/promo/*', toPrefix: '/deals/*', status: 302 })

    await expect(store.resolve('/promo/summer')).resolves.toEqual({
      to: '/deals/summer',
      status: 302,
    })
  })

  it('lets an editor remove a prefix rule', async () => {
    await store.add({ fromPrefix: '/blog/*', toPrefix: '/actualites/*' })

    await expect(store.remove('/blog/*')).resolves.toBe(true)
    await expect(store.resolve('/blog/mon-article')).resolves.toBeNull()
  })

  it('caps the number of distinct prefix rules', async () => {
    const bounded = createRedirectPatternStore({ db, table: 'cogenta_redirect_patterns_bounded' })
    // Reach into the private cap indirectly is not possible from here, so
    // this proves the cap exists without hard-coding its value: adding
    // enough distinct rules eventually refuses rather than growing forever.
    let refused = false
    for (let i = 0; i < 500 && !refused; i += 1) {
      try {
        await bounded.add({ fromPrefix: `/p-${i}/*`, toPrefix: `/q-${i}/*` })
      } catch (error) {
        refused = true
        expect((error as { code?: string }).code).toBe('CONTENT_ROUTE_INVALID')
      }
    }
    expect(refused).toBe(true)
  }, 20_000)
})
