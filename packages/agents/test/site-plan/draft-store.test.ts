import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createFileSitePlanStore,
  createMemorySitePlanStore,
  type SitePlanStore,
} from '../../src/site-plan/draft-store.js'
import type { SitePlanDraft } from '../../src/site-plan/types.js'

/**
 * One contract suite, run against both implementations — the in-memory one
 * and the on-disk one — as R1 requires: the degraded path is tested, not
 * only the convenient one. Here neither needs a service; the difference is
 * whether a draft survives the process that proposed it, which is exactly
 * what "the installer proposes, the admin decides later" depends on.
 */

const directories: string[] = []

afterAll(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })))
})

function draft(id: string, createdAt: string): SitePlanDraft {
  return {
    id,
    createdAt,
    brief: {
      activity: 'A restaurant.',
      audience: 'Diners.',
      tone: 'Warm.',
      languages: ['fr'],
      pages: [],
      contentTypes: [],
      constraints: [],
      summary: 'A site.',
      sources: [],
      warnings: [],
    },
    contentModel: { collections: [] },
    pages: [],
    skins: [],
    demoContent: [],
    violations: [],
    structuralGaps: [],
    warnings: [],
  }
}

const IMPLEMENTATIONS: readonly {
  name: string
  create: () => Promise<SitePlanStore>
}[] = [
  { name: 'in memory', create: async () => createMemorySitePlanStore() },
  {
    name: 'on disk',
    create: async () => {
      const directory = await mkdtemp(join(tmpdir(), 'cogenta-site-plan-'))
      directories.push(directory)
      return createFileSitePlanStore(directory)
    },
  },
]

for (const implementation of IMPLEMENTATIONS) {
  describe(`a site plan store ${implementation.name}`, () => {
    it('stores a draft with no decisions taken on it', async () => {
      const store = await implementation.create()

      const stored = await store.save(draft('d1', '2026-08-16T09:00:00.000Z'))

      expect(stored.decisions).toEqual({})
      expect(stored.appliedAt).toBeUndefined()
      expect((await store.get('d1')).draft.id).toBe('d1')
    })

    it('merges decisions across sittings rather than replacing them', async () => {
      const store = await implementation.create()
      await store.save(draft('d1', '2026-08-16T09:00:00.000Z'))

      await store.recordDecisions('d1', { 'contentModel:dish': 'accepted' })
      const after = await store.recordDecisions('d1', { 'pages:contact': 'rejected' })

      expect(after.decisions).toEqual({
        'contentModel:dish': 'accepted',
        'pages:contact': 'rejected',
      })
    })

    it('lists drafts newest first', async () => {
      const store = await implementation.create()
      await store.save(draft('older', '2026-08-15T09:00:00.000Z'))
      await store.save(draft('newer', '2026-08-16T09:00:00.000Z'))

      expect((await store.list()).map((stored) => stored.draft.id)).toEqual(['newer', 'older'])
    })

    it('names the draft it cannot find instead of returning nothing', async () => {
      const store = await implementation.create()

      await expect(store.get('missing')).rejects.toMatchObject({
        code: 'SITE_PLAN_DRAFT_NOT_FOUND',
      })
    })

    it('records that a plan was applied, and never applies anything itself', async () => {
      const store = await implementation.create()
      await store.save(draft('d1', '2026-08-16T09:00:00.000Z'))

      const applied = await store.markApplied('d1', '2026-08-16T11:00:00.000Z')

      expect(applied.appliedAt).toBe('2026-08-16T11:00:00.000Z')
      expect(applied.draft).toEqual(draft('d1', '2026-08-16T09:00:00.000Z'))
    })

    it('treats deleting a draft twice as done, not as an error', async () => {
      const store = await implementation.create()
      await store.save(draft('d1', '2026-08-16T09:00:00.000Z'))

      await store.delete('d1')
      await expect(store.delete('d1')).resolves.toBeUndefined()
      await expect(store.get('d1')).rejects.toMatchObject({ code: 'SITE_PLAN_DRAFT_NOT_FOUND' })
    })
  })
}

describe('the on-disk store specifically', () => {
  it('refuses an id that would escape its directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cogenta-site-plan-'))
    directories.push(directory)
    const store = createFileSitePlanStore(directory)

    await expect(store.get('../../etc/passwd')).rejects.toMatchObject({
      code: 'SITE_PLAN_DRAFT_NOT_FOUND',
    })
  })

  it('reports no drafts, rather than failing, before the directory exists', async () => {
    const store = createFileSitePlanStore(join(tmpdir(), `cogenta-never-created-${Date.now()}`))

    expect(await store.list()).toEqual([])
  })
})
