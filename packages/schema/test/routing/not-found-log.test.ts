import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNotFoundLogStore, type NotFoundLogStore } from '../../src/routing/not-found-log.js'

/**
 * `NotFoundLogStore` — the log of public URLs that answered a 404 (fiche 12
 * task 1). The three tests that matter most here are the anti-abuse ones:
 * this table is written by an anonymous, unauthenticated request, and it
 * must not be possible to grow it, or leak anything personal into it, by
 * doing that in a loop.
 */

describe('the not-found log', () => {
  let db: DatabaseHandle
  let store: NotFoundLogStore
  let clock = 0

  beforeEach(async () => {
    db = await createSqliteHandle({ url: ':memory:' })
    clock = 1_700_000_000_000
    store = createNotFoundLogStore({
      db,
      now: () => {
        clock += 1000
        return clock
      },
    })
  })

  afterEach(async () => {
    await db.close()
  })

  it('aggregates repeat requests for the same path into one row', async () => {
    await store.record({ path: '/missing' })
    await store.record({ path: '/missing' })
    await store.record({ path: '/missing?utm_source=x' })

    const rows = await store.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ path: '/missing', hits: 3 })
  })

  it('sorts by hit count, most requested first', async () => {
    await store.record({ path: '/a' })
    await store.record({ path: '/b' })
    await store.record({ path: '/b' })
    await store.record({ path: '/b' })

    const rows = await store.list()
    expect(rows.map((row) => row.path)).toEqual(['/b', '/a'])
  })

  it('never records an IP address or a user agent — there is no field for either', async () => {
    await store.record({ path: '/missing', referrer: 'https://example.com/page' })

    const [row] = await store.list()
    expect(row).toBeDefined()
    expect(Object.keys(row as object).sort()).toEqual([
      'firstSeen',
      'hits',
      'lastReferrer',
      'lastSeen',
      'path',
    ])
  })

  it('reduces a referrer to origin and pathname, dropping any query string', async () => {
    await store.record({
      path: '/missing',
      referrer: 'https://example.com/blog/post?utm_source=newsletter&token=secret',
    })

    const [row] = await store.list()
    expect(row?.lastReferrer).toBe('https://example.com/blog/post')
  })

  it('drops an unparsable referrer rather than storing garbage', async () => {
    await store.record({ path: '/missing', referrer: 'not a url' })

    const [row] = await store.list()
    expect(row?.lastReferrer).toBeNull()
  })

  it('caps the number of distinct paths tracked, refusing new ones past the limit', async () => {
    const bounded = createNotFoundLogStore({ db, maxPaths: 2, now: () => clock })

    await bounded.record({ path: '/one' })
    await bounded.record({ path: '/two' })
    await bounded.record({ path: '/three' })

    const rows = await bounded.list()
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.path).sort()).toEqual(['/one', '/two'])
  })

  it('still counts a repeat hit on an already-tracked path once the cap is reached', async () => {
    const bounded = createNotFoundLogStore({ db, maxPaths: 1, now: () => clock })

    await bounded.record({ path: '/one' })
    await bounded.record({ path: '/one' })
    await bounded.record({ path: '/two' }) // refused: the cap is already spent

    const rows = await bounded.list()
    expect(rows).toEqual([expect.objectContaining({ path: '/one', hits: 2 })])
  })

  it('never throws for a request, however long or malformed the path', async () => {
    await expect(store.record({ path: `/${'x'.repeat(10_000)}` })).resolves.toBeUndefined()
    await expect(store.list()).resolves.toEqual([])
  })

  it('lets an editor dismiss a tracked path', async () => {
    await store.record({ path: '/missing' })

    await expect(store.remove('/missing')).resolves.toBe(true)
    await expect(store.list()).resolves.toEqual([])
    await expect(store.remove('/missing')).resolves.toBe(false)
  })

  it('purges paths not seen in more than the given number of days', async () => {
    await store.record({ path: '/old' })
    clock += 40 * 24 * 60 * 60 * 1000
    await store.record({ path: '/recent' })

    const purged = await store.purge(30)

    expect(purged).toBe(1)
    const rows = await store.list()
    expect(rows.map((row) => row.path)).toEqual(['/recent'])
  })
})

describe('the not-found log under real concurrency', () => {
  // A **file**, not `:memory:` (matching `packages/commerce/test/stock-concurrency.test.ts`):
  // two in-memory handles are two unrelated databases, so racing against them
  // would prove nothing. A file is one database two connections genuinely
  // contend for, and alternating between exactly two real connections — never
  // many concurrent top-level transactions through one handle, which SQLite's
  // savepoint-based transaction nesting does not support — is what makes
  // `Promise.all` below actually concurrent rather than merely interleaved.
  let directory: string
  let first: DatabaseHandle
  let second: DatabaseHandle

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-not-found-race-'))
    first = await createSqliteHandle({ url: join(directory, 'not-found.db') })
    second = await createSqliteHandle({ url: join(directory, 'not-found.db') })
  })

  afterEach(async () => {
    await first.close()
    await second.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('never crashes and always converges to one row when many requests race on the same brand-new path', async () => {
    // The scenario the write path exists for: an anonymous scanner, or
    // simply several visitors, hitting the same never-before-seen 404 at
    // once. `record()`'s terminal write is an upsert (`on conflict do
    // update` / `on duplicate key update`) specifically because a plain
    // `insert` would let the loser of this race crash with a duplicate-key
    // error on the `path` primary key — precisely the 500 a 404 log must
    // never cause. This proves the outcome that guards against: no throw,
    // and every hit lands on exactly one row however many callers raced to
    // create it.
    const storeA = createNotFoundLogStore({ db: first })
    const storeB = createNotFoundLogStore({ db: second })
    const concurrent = 20

    await Promise.all(
      Array.from({ length: concurrent }, (_unused, index) =>
        (index % 2 === 0 ? storeA : storeB).record({ path: '/stampede' }),
      ),
    )

    const rows = await storeA.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ path: '/stampede', hits: concurrent })
  })
})
