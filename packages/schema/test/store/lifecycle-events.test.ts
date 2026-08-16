import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ContentLifecycleEvent } from '../../src/store/lifecycle-events.js'
import { withLifecycleEvents } from '../../src/store/lifecycle-events.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import type { CollectionDefinition } from '../../src/types.js'

/**
 * A real SQLite store throughout — the project forbids mocking the database,
 * and the whole point of wrapping the store is that the events follow what the
 * store really did, not what a caller intended.
 */
const article: CollectionDefinition = {
  name: 'lifecycle_article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/news/:slug' },
  versioning: { drafts: true, history: true },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', required: true, options: { from: 'title' } },
    // Declared on purpose: contract A makes `publishedAt` an ordinary optional
    // field, and the store only fills it in for a collection that declares it.
    // Without it the event's `publishedAt` is legitimately `null`, which would
    // make the assertion below prove nothing about the pass-through.
    publishedAt: { kind: 'datetime', options: {} },
  },
  permissions: { read: ['public'] },
}

/** Same collection without a route — a `path` has to be `null`, not invented. */
const memo: CollectionDefinition = {
  name: 'lifecycle_memo',
  labels: { singular: 'Memo', plural: 'Memos' },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: { read: ['editor'] },
}

describe('withLifecycleEvents', () => {
  let directory: string
  let db: DatabaseHandle
  let events: ContentLifecycleEvent[]

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-lifecycle-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [article, memo])
    events = []
  })

  afterEach(async () => {
    await dropSchemaTables(db, [article, memo])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  function wrap(collection: CollectionDefinition = article) {
    return withLifecycleEvents(createContentStore({ db, collection }), {
      collection,
      emit: (event) => {
        events.push(event)
      },
    })
  }

  it('emits nothing when a draft is created or edited', async () => {
    const store = wrap()
    const draft = await store.create({ values: { title: 'Hello', slug: 'hello' } })
    await store.update(draft.id, { values: { title: 'Hello again' } })

    expect(events).toEqual([])
  })

  it('emits content.publish with the entry identity and its real path', async () => {
    const store = wrap()
    const draft = await store.create({ values: { title: 'Hello', slug: 'hello' } })

    await store.publish(draft.id)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      event: 'content.publish',
      collection: 'lifecycle_article',
      id: draft.id,
      status: 'published',
      path: '/news/hello',
    })
    expect(events[0]?.publishedAt).not.toBeNull()
  })

  it('emits content.publish for an entry created already published', async () => {
    const store = wrap()

    const created = await store.create({
      status: 'published',
      values: { title: 'Straight out', slug: 'straight-out' },
    })

    expect(events.map((event) => event.event)).toEqual(['content.publish'])
    expect(events[0]?.id).toBe(created.id)
  })

  it('emits content.unpublish when the page stops being public', async () => {
    const store = wrap()
    const draft = await store.create({ values: { title: 'Hello', slug: 'hello' } })
    await store.publish(draft.id)
    events.length = 0

    await store.unpublish(draft.id)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ event: 'content.unpublish', id: draft.id, status: 'draft' })
  })

  it('emits content.delete only for content that was actually public', async () => {
    const store = wrap()
    const published = await store.create({ values: { title: 'Gone', slug: 'gone' } })
    await store.publish(published.id)
    const neverPublic = await store.create({ values: { title: 'Private', slug: 'private' } })
    events.length = 0

    await store.delete(neverPublic.id)
    expect(events).toEqual([])

    await store.delete(published.id)
    expect(events.map((event) => event.event)).toEqual(['content.delete'])
    expect(events[0]?.path).toBe('/news/gone')
  })

  it('reports a null path for a collection with no route', async () => {
    const store = wrap(memo)

    await store.create({ status: 'published', values: { title: 'Internal note' } })

    expect(events[0]).toMatchObject({ event: 'content.publish', path: null })
  })

  it('does not fail the publish when the receiver throws', async () => {
    const failures: unknown[] = []
    const store = withLifecycleEvents(createContentStore({ db, collection: article }), {
      collection: article,
      emit: () => {
        throw new Error('receiver is down')
      },
      onError: (error) => {
        failures.push(error)
      },
    })
    const draft = await store.create({ values: { title: 'Resilient', slug: 'resilient' } })

    const published = await store.publish(draft.id)

    expect(published.status).toBe('published')
    expect(failures).toHaveLength(1)
  })

  it('waits for the receiver before returning, so a caller can await delivery', async () => {
    const order: string[] = []
    const store = withLifecycleEvents(createContentStore({ db, collection: article }), {
      collection: article,
      emit: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push('delivered')
      },
    })
    const draft = await store.create({ values: { title: 'Ordered', slug: 'ordered' } })

    await store.publish(draft.id)
    order.push('publish returned')

    expect(order).toEqual(['delivered', 'publish returned'])
  })
})
