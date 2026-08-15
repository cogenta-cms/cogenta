import { beforeEach, describe, expect, it } from 'vitest'
import type { VectorRecord, VectorStore } from '../../../src/rag/vector/types.js'

export const CONTRACT_DIMENSIONS = 4

export interface VectorContractHarness {
  readonly store: VectorStore
  dispose?(): Promise<void>
}

/** L2-normalised so cosine similarity between two records is their dot product. */
function unit(values: readonly number[]): readonly number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  return norm === 0 ? values : values.map((value) => value / norm)
}

export function record(
  id: string,
  vector: readonly number[],
  overrides: Partial<Omit<VectorRecord, 'chunk' | 'vector'>> = {},
  text = `text of ${id}`,
): VectorRecord {
  return {
    siteId: 'site-a',
    collection: 'articles',
    entryId: id,
    locale: 'en',
    status: 'published',
    ...overrides,
    chunk: {
      id: `${id}:chunk`,
      documentId: id,
      blockIds: [`${id}-b1`],
      text,
      hash: `hash-${id}`,
    },
    vector: unit(vector),
  }
}

/**
 * The single contract suite for `VectorStore`. Every implementation runs **this**
 * file, never a copy adapted to what that driver happens to do — the project's
 * standing rule that the degraded driver is tested, not only the optimal one,
 * and that swapping between them changes nothing a caller can observe.
 */
export function runVectorStoreContract(
  name: string,
  create: () => Promise<VectorContractHarness> | VectorContractHarness,
): void {
  describe(`VectorStore contract — ${name}`, () => {
    let harness: VectorContractHarness
    let store: VectorStore

    beforeEach(async () => {
      harness = await create()
      store = harness.store
      await store.clear()
    })

    it('ranks the record closest to the query vector first', async () => {
      await store.upsert([
        record('a', [1, 0, 0, 0]),
        record('b', [0, 1, 0, 0]),
        record('c', [0.9, 0.1, 0, 0]),
      ])

      const matches = await store.search([1, 0, 0, 0], { limit: 3 })

      expect(matches.map((match) => match.record.entryId)).toEqual(['a', 'c'])
      expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 1)
      await harness.dispose?.()
    })

    it('never returns a record whose similarity is zero or negative', async () => {
      await store.upsert([record('same', [1, 0, 0, 0]), record('opposite', [-1, 0, 0, 0])])

      const matches = await store.search([1, 0, 0, 0], { limit: 10 })

      expect(matches.map((match) => match.record.entryId)).toEqual(['same'])
      await harness.dispose?.()
    })

    it('replaces a record rather than duplicating it when the same chunk is upserted twice', async () => {
      await store.upsert([record('a', [1, 0, 0, 0], {}, 'first text')])
      await store.upsert([record('a', [1, 0, 0, 0], {}, 'second text')])

      expect(await store.count()).toBe(1)
      const matches = await store.search([1, 0, 0, 0], { limit: 5 })
      expect(matches[0]?.record.chunk.text).toBe('second text')
      await harness.dispose?.()
    })

    it('honours the limit', async () => {
      await store.upsert([
        record('a', [1, 0, 0, 0]),
        record('b', [0.9, 0.1, 0, 0]),
        record('c', [0.8, 0.2, 0, 0]),
      ])

      expect(await store.search([1, 0, 0, 0], { limit: 2 })).toHaveLength(2)
      await harness.dispose?.()
    })

    it('drops matches below minScore', async () => {
      await store.upsert([record('near', [1, 0, 0, 0]), record('far', [0.2, 1, 0, 0])])

      const matches = await store.search([1, 0, 0, 0], { limit: 10, minScore: 0.9 })

      expect(matches.map((match) => match.record.entryId)).toEqual(['near'])
      await harness.dispose?.()
    })

    it('never crosses a site boundary', async () => {
      await store.upsert([
        record('mine', [1, 0, 0, 0], { siteId: 'site-a' }),
        record('theirs', [1, 0, 0, 0], { siteId: 'site-b' }),
      ])

      const matches = await store.search([1, 0, 0, 0], { limit: 10, filter: { siteId: 'site-a' } })

      expect(matches.map((match) => match.record.entryId)).toEqual(['mine'])
      await harness.dispose?.()
    })

    it('filters by collection, locale and status', async () => {
      await store.upsert([
        record('wanted', [1, 0, 0, 0]),
        record('other-collection', [1, 0, 0, 0], { collection: 'pages' }),
        record('other-locale', [1, 0, 0, 0], { locale: 'fr' }),
        record('other-status', [1, 0, 0, 0], { status: 'draft' }),
      ])

      const matches = await store.search([1, 0, 0, 0], {
        limit: 10,
        filter: { collections: ['articles'], locales: ['en'], statuses: ['published'] },
      })

      expect(matches.map((match) => match.record.entryId)).toEqual(['wanted'])
      await harness.dispose?.()
    })

    it('excludes the entry a caller asked to leave out, which is what duplicate detection needs', async () => {
      await store.upsert([record('self', [1, 0, 0, 0]), record('twin', [1, 0, 0, 0])])

      const matches = await store.search([1, 0, 0, 0], {
        limit: 10,
        filter: { excludeEntryIds: ['self'] },
      })

      expect(matches.map((match) => match.record.entryId)).toEqual(['twin'])
      await harness.dispose?.()
    })

    it('an empty collection filter matches nothing rather than everything', async () => {
      await store.upsert([record('a', [1, 0, 0, 0])])

      expect(await store.search([1, 0, 0, 0], { filter: { collections: [] } })).toEqual([])
      await harness.dispose?.()
    })

    it('removes by chunk id, and ignores an id it never held', async () => {
      await store.upsert([record('a', [1, 0, 0, 0]), record('b', [0.9, 0.1, 0, 0])])

      await store.remove(['a:chunk', 'never-existed'])

      expect(await store.count()).toBe(1)
      await harness.dispose?.()
    })

    it('removes every chunk of an entry without touching another entry', async () => {
      await store.upsert([record('a', [1, 0, 0, 0]), record('b', [0.9, 0.1, 0, 0])])

      await store.removeEntries({ siteId: 'site-a', collection: 'articles', entryIds: ['a'] })

      const matches = await store.search([1, 0, 0, 0], { limit: 10 })
      expect(matches.map((match) => match.record.entryId)).toEqual(['b'])
      await harness.dispose?.()
    })

    it('counts only what the filter selects', async () => {
      await store.upsert([
        record('a', [1, 0, 0, 0]),
        record('b', [1, 0, 0, 0], { siteId: 'site-b' }),
      ])

      expect(await store.count()).toBe(2)
      expect(await store.count({ siteId: 'site-a' })).toBe(1)
      await harness.dispose?.()
    })

    it('refuses a vector of the wrong dimension instead of indexing nonsense', async () => {
      await expect(
        store.upsert([
          {
            ...record('a', [1, 0, 0, 0]),
            vector: [1, 0, 0, 0, 0, 0],
          },
        ]),
      ).rejects.toMatchObject({ code: 'VECTOR_DIMENSION_MISMATCH' })

      expect(await store.count()).toBe(0)
      await harness.dispose?.()
    })

    it('keeps the chunk metadata a citation needs', async () => {
      await store.upsert([record('a', [1, 0, 0, 0], {}, 'the body of the chunk')])

      const [match] = await store.search([1, 0, 0, 0], { limit: 1 })

      expect(match?.record.chunk).toMatchObject({
        id: 'a:chunk',
        documentId: 'a',
        blockIds: ['a-b1'],
        text: 'the body of the chunk',
        hash: 'hash-a',
      })
      await harness.dispose?.()
    })

    it('clear empties the store', async () => {
      await store.upsert([record('a', [1, 0, 0, 0])])
      await store.clear()

      expect(await store.count()).toBe(0)
      expect(await store.search([1, 0, 0, 0])).toEqual([])
      await harness.dispose?.()
    })
  })
}
