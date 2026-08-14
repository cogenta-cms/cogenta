import { describe, expect, it } from 'vitest'
import type { MemoryRecord, MemoryStore } from '../../src/memory/types.js'

export interface MemoryContractHarness {
  createStore(): Promise<MemoryStore>
  dispose?(): Promise<void>
}

function recordAt(
  id: string,
  siteId: string,
  createdAt: string,
  overrides: Partial<MemoryRecord> = {},
): MemoryRecord {
  return {
    id,
    type: 'episodic',
    siteId,
    content: `record ${id}`,
    createdAt,
    ...overrides,
  }
}

/** The single contract suite for `MemoryStore`, played against the memory and file implementations. */
export function runMemoryStoreContract(
  name: string,
  harness: () => Promise<MemoryContractHarness>,
): void {
  describe(`MemoryStore — ${name}`, () => {
    it('returns nothing for a site with no records', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        expect(await store.query({ siteId: 'site-a' })).toEqual([])
      } finally {
        await dispose?.()
      }
    })

    it('saves a record and queries it back', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const record = recordAt('r1', 'site-a', '2026-01-01T00:00:00.000Z')
        await store.save(record)
        expect(await store.query({ siteId: 'site-a' })).toEqual([record])
      } finally {
        await dispose?.()
      }
    })

    it('never lets one site’s query see another site’s records — isolation is never crossed', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(recordAt('a', 'site-a', '2026-01-01T00:00:00.000Z'))
        await store.save(recordAt('b', 'site-b', '2026-01-01T00:00:00.000Z'))

        expect((await store.query({ siteId: 'site-a' })).map((r) => r.id)).toEqual(['a'])
        expect((await store.query({ siteId: 'site-b' })).map((r) => r.id)).toEqual(['b'])
      } finally {
        await dispose?.()
      }
    })

    it('filters by type and by agentName', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(recordAt('a', 'site-a', '2026-01-01T00:00:00.000Z', { type: 'semantic' }))
        await store.save(
          recordAt('b', 'site-a', '2026-01-01T00:00:00.000Z', {
            type: 'procedural',
            agentName: 'security',
          }),
        )
        await store.save(
          recordAt('c', 'site-a', '2026-01-01T00:00:00.000Z', {
            type: 'procedural',
            agentName: 'writer',
          }),
        )

        expect(
          (await store.query({ siteId: 'site-a', type: 'procedural', agentName: 'security' })).map(
            (r) => r.id,
          ),
        ).toEqual(['b'])
      } finally {
        await dispose?.()
      }
    })

    it('queries most-recent-first and caps at the given limit', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(recordAt('older', 'site-a', '2026-01-01T00:00:00.000Z'))
        await store.save(recordAt('newer', 'site-a', '2026-01-02T00:00:00.000Z'))

        const all = await store.query({ siteId: 'site-a' })
        expect(all.map((r) => r.id)).toEqual(['newer', 'older'])

        const capped = await store.query({ siteId: 'site-a', limit: 1 })
        expect(capped).toHaveLength(1)
      } finally {
        await dispose?.()
      }
    })

    it('forget removes one record by id, and is a no-op for an unknown id', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(recordAt('a', 'site-a', '2026-01-01T00:00:00.000Z'))
        await store.forget('a')
        expect(await store.query({ siteId: 'site-a' })).toEqual([])
        await expect(store.forget('ghost')).resolves.toBeUndefined()
      } finally {
        await dispose?.()
      }
    })

    it('prune removes only records older than the cutoff, scoped to one site', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(recordAt('old', 'site-a', '2026-01-01T00:00:00.000Z'))
        await store.save(recordAt('recent', 'site-a', '2026-01-10T00:00:00.000Z'))
        await store.save(recordAt('other-site-old', 'site-b', '2026-01-01T00:00:00.000Z'))
        const fixedNow = () => new Date('2026-01-10T00:00:00.000Z').getTime()

        const removed = await store.prune({ siteId: 'site-a', olderThanMs: 86_400_000 }, fixedNow)

        expect(removed).toBe(1)
        expect((await store.query({ siteId: 'site-a' })).map((r) => r.id)).toEqual(['recent'])
        expect((await store.query({ siteId: 'site-b' })).map((r) => r.id)).toEqual([
          'other-site-old',
        ])
      } finally {
        await dispose?.()
      }
    })

    it('consolidate keeps only the newest N records in scope, removing the rest', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(recordAt('a', 'site-a', '2026-01-01T00:00:00.000Z', { type: 'episodic' }))
        await store.save(recordAt('b', 'site-a', '2026-01-02T00:00:00.000Z', { type: 'episodic' }))
        await store.save(recordAt('c', 'site-a', '2026-01-03T00:00:00.000Z', { type: 'episodic' }))

        const removed = await store.consolidate({ siteId: 'site-a', type: 'episodic', keep: 2 })

        expect(removed).toBe(1)
        expect((await store.query({ siteId: 'site-a' })).map((r) => r.id).sort()).toEqual([
          'b',
          'c',
        ])
      } finally {
        await dispose?.()
      }
    })
  })
}
