import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SearchDriver } from '../../src/search/types.js'
import { withSearchIndexing } from '../../src/store/search-indexing.js'
import { type ContentStore, createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import type { CollectionDefinition } from '../../src/types.js'

/**
 * The single contract suite for `withSearchIndexing`, played against every
 * dialect — SQLite as a plain unit test (both with and without FTS5), and
 * Postgres/MySQL/MariaDB as integration tests when the services are up.
 *
 * One suite rather than one per dialect for the same reason `SearchDriver`
 * has one: the guarantees here are about *what gets indexed and when*, and
 * those must not differ by engine even though the ranking does.
 */

export interface IndexingHarness {
  readonly db: DatabaseHandle
  readonly index: SearchDriver
  dispose(): Promise<void>
}

/**
 * Drafts on, on purpose: this is the shape where a working copy of a
 * *published* entry exists, which is the case the wrapper must never index as
 * published.
 */
export const INDEXED_ARTICLE: CollectionDefinition = {
  name: 'indexed_article',
  labels: { singular: 'Article', plural: 'Articles' },
  versioning: { drafts: true, history: true },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    body: { kind: 'text', options: { max: 4000 } },
  },
  permissions: { read: ['public'] },
}

export function runSearchIndexingContract(
  label: string,
  create: () => Promise<IndexingHarness>,
): void {
  describe(`withSearchIndexing — ${label}`, () => {
    let harness: IndexingHarness

    beforeEach(async () => {
      harness = await create()
      await createSchemaTables(harness.db, [INDEXED_ARTICLE])
      await harness.index.clear()
    })

    afterEach(async () => {
      await harness.index.clear()
      await dropSchemaTables(harness.db, [INDEXED_ARTICLE])
      await harness.dispose()
    })

    const wrapped = (): ContentStore =>
      withSearchIndexing(createContentStore({ db: harness.db, collection: INDEXED_ARTICLE }), {
        collection: INDEXED_ARTICLE,
        index: harness.index,
      })

    const idsFor = async (
      text: string,
      status?: 'draft' | 'published',
    ): Promise<readonly string[]> => {
      const results = await harness.index.search({
        text,
        locale: 'en',
        ...(status === undefined ? {} : { status }),
      })
      return results.hits.map((hit) => hit.id)
    }

    it('a published entry becomes findable, and a draft stays out of a published search', async () => {
      const store = wrapped()
      const draft = await store.create({ values: { title: 'Cathedral windows', body: 'glass' } })

      expect(await idsFor('cathedral')).toEqual([])
      expect(await idsFor('cathedral', 'draft')).toEqual([draft.id])

      await store.publish(draft.id)
      expect(await idsFor('cathedral')).toEqual([draft.id])
    })

    it('never files an unpublished edit under the published status', async () => {
      const store = wrapped()
      const entry = await store.create({ values: { title: 'Original heading', body: 'first' } })
      await store.publish(entry.id)

      // With drafts on, this edit does not change what the public sees. The
      // index must agree: searching the new word as the public finds nothing,
      // and searching the old word still finds the entry.
      await store.update(entry.id, { values: { title: 'Rewritten heading' } })

      expect(await idsFor('rewritten')).toEqual([])
      expect(await idsFor('original')).toEqual([entry.id])

      await store.publish(entry.id)
      expect(await idsFor('rewritten')).toEqual([entry.id])
      expect(await idsFor('original')).toEqual([])
    })

    it('unpublishing removes an entry from a published search without losing it entirely', async () => {
      const store = wrapped()
      const entry = await store.create({ values: { title: 'Ephemeral notice', body: 'x' } })
      await store.publish(entry.id)
      expect(await idsFor('ephemeral')).toEqual([entry.id])

      await store.unpublish(entry.id)
      expect(await idsFor('ephemeral')).toEqual([])
      expect(await idsFor('ephemeral', 'draft')).toEqual([entry.id])
    })

    it('deleting an entry removes its row from the index', async () => {
      const store = wrapped()
      const entry = await store.create({ values: { title: 'Transient', body: 'x' } })
      await store.publish(entry.id)
      expect(await idsFor('transient')).toEqual([entry.id])

      await store.delete(entry.id)
      expect(await idsFor('transient')).toEqual([])
      expect(await idsFor('transient', 'draft')).toEqual([])
    })

    it('restoring an old version re-indexes what that version actually said', async () => {
      const store = wrapped()
      const entry = await store.create({ values: { title: 'Alpaca census', body: 'x' } })
      await store.publish(entry.id)
      await store.update(entry.id, { values: { title: 'Llama census' } })
      await store.publish(entry.id)
      expect(await idsFor('llama')).toEqual([entry.id])

      const versions = await store.history(entry.id)
      const first = versions.at(-1)
      if (first === undefined) throw new Error('no history to restore from')
      await store.restore(entry.id, first.version)
      await store.publish(entry.id)

      expect(await idsFor('alpaca')).toEqual([entry.id])
      expect(await idsFor('llama')).toEqual([])
    })

    it('a failing index never fails the content write, and reports through onError', async () => {
      const failures: unknown[] = []
      const broken: SearchDriver = {
        ...harness.index,
        index: async () => {
          throw new Error('index is on fire')
        },
      }
      const store = withSearchIndexing(
        createContentStore({ db: harness.db, collection: INDEXED_ARTICLE }),
        { collection: INDEXED_ARTICLE, index: broken, onError: (error) => failures.push(error) },
      )

      const entry = await store.create({ values: { title: 'Survives', body: 'x' } })
      expect(entry.id).toBeTruthy()
      // The content write really landed: the index is derived data, the
      // entry is not.
      const readBack = await store.read(entry.id, { state: 'working' })
      expect(readBack?.values['title']).toBe('Survives')
      expect(failures).toHaveLength(1)
    })
  })
}
