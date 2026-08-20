import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createScheduledPublishFailureStore } from '../../src/store/scheduled-publish-failures.js'

let db: DatabaseHandle

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
})

afterEach(async () => {
  await db.close()
})

describe('ScheduledPublishFailureStore', () => {
  it('is empty when nothing has ever failed', async () => {
    const store = createScheduledPublishFailureStore(db)
    await store.ensureTable()
    expect(await store.list()).toEqual([])
  })

  it('records a failure and lists it', async () => {
    const store = createScheduledPublishFailureStore(db, () => 1_000)
    await store.ensureTable()

    await store.record({
      collection: 'article',
      entryId: 'entry-1',
      locale: 'en',
      error: 'CONTENT_INVALID: title is required',
    })

    const listed = await store.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      collection: 'article',
      entryId: 'entry-1',
      locale: 'en',
      error: 'CONTENT_INVALID: title is required',
    })
  })

  it('replaces, rather than accumulates, repeated failures on the same entry', async () => {
    const store = createScheduledPublishFailureStore(db)
    await store.ensureTable()

    await store.record({ collection: 'article', entryId: 'entry-1', locale: 'en', error: 'first' })
    await store.record({
      collection: 'article',
      entryId: 'entry-1',
      locale: 'en',
      error: 'second, more recent',
    })

    const listed = await store.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.error).toBe('second, more recent')
  })

  it('keeps failures on different locales of the same entry apart', async () => {
    const store = createScheduledPublishFailureStore(db)
    await store.ensureTable()

    await store.record({
      collection: 'article',
      entryId: 'entry-1',
      locale: 'en',
      error: 'en failed',
    })
    await store.record({
      collection: 'article',
      entryId: 'entry-1',
      locale: 'fr',
      error: 'fr failed',
    })

    expect(await store.list()).toHaveLength(2)
  })

  it('clears once the entry actually publishes', async () => {
    const store = createScheduledPublishFailureStore(db)
    await store.ensureTable()

    await store.record({ collection: 'article', entryId: 'entry-1', locale: 'en', error: 'boom' })
    await store.clear('article', 'entry-1', 'en')

    expect(await store.list()).toEqual([])
  })

  it('clearing an entry with no recorded failure is not an error', async () => {
    const store = createScheduledPublishFailureStore(db)
    await store.ensureTable()

    await expect(store.clear('article', 'never-failed', 'en')).resolves.toBeUndefined()
  })
})
