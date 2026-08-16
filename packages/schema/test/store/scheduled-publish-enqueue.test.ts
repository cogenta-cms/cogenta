import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDatabaseQueue,
  createLogger,
  createSqliteHandle,
  type DatabaseHandle,
} from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  registerScheduledPublishing,
  type ScheduledPublication,
} from '../../src/scheduling/publish.js'
import { withScheduledPublishEnqueue } from '../../src/store/scheduled-publish-enqueue.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import type { CollectionDefinition } from '../../src/types.js'

const silent = createLogger({ level: 'silent' })

const article: CollectionDefinition = {
  name: 'sched_article',
  labels: { singular: 'Article', plural: 'Articles' },
  versioning: { drafts: true, history: true },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    // Declared: the store only fills `publishedAt` in for a collection that
    // declares it (contract A treats it as an ordinary field).
    publishedAt: { kind: 'datetime', options: {} },
  },
  permissions: { read: ['public'] },
}

describe('withScheduledPublishEnqueue', () => {
  let directory: string
  let db: DatabaseHandle
  let published: ScheduledPublication[]

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-sched-enqueue-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [article])
    published = []
  })

  afterEach(async () => {
    await dropSchemaTables(db, [article])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  /**
   * The acceptance criterion of the task: create an entry with a `publishedAt`
   * in the near future, advance the injected clock past it, and prove the
   * entry really becomes `published` — the enqueue side (this decorator) and
   * the publish side (`registerScheduledPublishing` + the handler `serve.ts`
   * registers) wired end to end, with a real SQLite-backed queue, not a mock.
   */
  it('publishes a scheduled entry once its queued job comes due', async () => {
    let clock = Date.now()
    const queue = createDatabaseQueue({ db, logger: silent, now: () => clock })
    const rawStore = createContentStore({ db, collection: article })

    registerScheduledPublishing(
      queue,
      async (publication) => {
        published.push(publication)
        // The same re-check `serve.ts`'s handler does: only publish if the
        // entry is still `scheduled` when the job comes due.
        const entry = await rawStore.read(publication.entryId, { state: 'working' })
        if (entry?.status === 'scheduled') await rawStore.publish(publication.entryId)
      },
      { logger: silent },
    )

    const store = withScheduledPublishEnqueue(rawStore, { collection: article, queue })

    const publishAt = clock + 3600_000
    const created = await store.create({
      status: 'scheduled',
      values: { title: 'Later', publishedAt: new Date(publishAt).toISOString() },
    })
    expect(created.status).toBe('scheduled')

    // Before the hour: nothing happens.
    await expect(queue.tick()).resolves.toBe(0)
    expect(published).toHaveLength(0)

    // A cron-style tick landing after the hour, the honest promise of R1.
    clock = publishAt + 60_000
    await expect(queue.tick()).resolves.toBe(1)

    expect(published).toEqual([
      expect.objectContaining({ collection: 'sched_article', entryId: created.id }),
    ])
    const republished = await rawStore.read(created.id, { state: 'working' })
    expect(republished?.status).toBe('published')

    await queue.close()
  })

  it('re-enqueues on every save but the handler only ever publishes once', async () => {
    let clock = Date.now()
    const queue = createDatabaseQueue({ db, logger: silent, now: () => clock })
    const rawStore = createContentStore({ db, collection: article })

    registerScheduledPublishing(
      queue,
      async (publication) => {
        published.push(publication)
        const entry = await rawStore.read(publication.entryId, { state: 'working' })
        if (entry?.status === 'scheduled') await rawStore.publish(publication.entryId)
      },
      { logger: silent },
    )

    const store = withScheduledPublishEnqueue(rawStore, { collection: article, queue })
    const publishAt = clock + 3600_000

    const created = await store.create({
      status: 'scheduled',
      values: { title: 'Later', publishedAt: new Date(publishAt).toISOString() },
    })
    // A second save of the same still-scheduled entry queues a second job —
    // deliberately, since this decorator tracks no previous job id.
    await store.update(created.id, { values: { title: 'Later, edited' } })

    clock = publishAt + 60_000
    await queue.tick()
    await queue.tick()

    // Both jobs fired the handler, but the second found an already-published
    // entry and skipped the redundant `publish()` — the re-check is what
    // makes duplicate enqueues harmless.
    expect(published).toHaveLength(2)
    const entry = await rawStore.read(created.id, { state: 'working' })
    expect(entry?.status).toBe('published')

    await queue.close()
  })

  it('never enqueues a draft, and never enqueues an entry published outright', async () => {
    const queue = createDatabaseQueue({ db, logger: silent })
    const rawStore = createContentStore({ db, collection: article })
    let handlerCalls = 0
    registerScheduledPublishing(
      queue,
      async () => {
        handlerCalls += 1
      },
      { logger: silent },
    )

    const store = withScheduledPublishEnqueue(rawStore, { collection: article, queue })
    await store.create({ values: { title: 'Just a draft' } })
    await store.create({ status: 'published', values: { title: 'Straight out' } })

    await expect(queue.tick()).resolves.toBe(0)
    expect(handlerCalls).toBe(0)

    await queue.close()
  })
})
