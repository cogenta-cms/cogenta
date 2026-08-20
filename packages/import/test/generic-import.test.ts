import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore, createSchemaTables, defineCollection, f } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeGeneric, applyGeneric } from '../src/generic-import.js'
import { proposeFieldMapping } from '../src/mapping.js'
import { createImportTrackingStore } from '../src/tracking.js'

const note = defineCollection({
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    body: f.text({ multiline: true }),
  },
  permissions: { read: ['public'], create: ['admin'], update: ['admin'], delete: ['admin'] },
})

describe('analyzeGeneric / applyGeneric', () => {
  const dirs: string[] = []
  const disposers: (() => Promise<void>)[] = []

  afterEach(async () => {
    await Promise.all(disposers.splice(0).map((dispose) => dispose()))
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function withSite() {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-generic-import-'))
    dirs.push(dir)
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(dir, 'site.db'),
    })
    disposers.push(selection.dispose)
    await createSchemaTables(selection.instance, [note])
    return selection.instance
  }

  it('proposes a mapping and previews records without writing anything', () => {
    const records = [
      { sourceId: '1', values: { Title: 'Hello', Author: 'Jane' } },
      { sourceId: '2', values: { Title: 'Second', Author: 'Jo' } },
    ]
    const report = analyzeGeneric(records, note)
    expect(report.totalRecords).toBe(2)
    expect(report.sourceFields).toEqual(['Title', 'Author'])
    expect(report.proposedMapping).toEqual({
      targetCollection: 'note',
      fields: { Title: 'title', Author: null },
    })
    expect(report.sample).toHaveLength(2)
  })

  it('writes every record into the mapped collection', async () => {
    const db = await withSite()
    const tracking = createImportTrackingStore({ db })
    const run = await tracking.createRun({ source: 'csv', createdBy: null, analysis: null })
    const store = createContentStore({ db, collection: note })

    const records = [
      { sourceId: '1', values: { Title: 'Hello' } },
      { sourceId: '2', values: { Title: 'World' } },
    ]
    const mapping = proposeFieldMapping(['Title'], note)

    const report = await applyGeneric({
      records,
      mapping,
      collections: [note],
      storeFor: () => store,
      tracking,
      runId: run.id,
      createdBy: 'user-1',
    })

    expect(report.imported).toBe(2)
    expect(report.resumedSkips).toBe(0)
    expect(report.errors).toEqual([])

    const list = await store.list({ state: 'working' })
    expect(list.items.map((entry) => entry.values.title).sort()).toEqual(['Hello', 'World'])
  })

  it('resumes without duplicating already-recorded records', async () => {
    const db = await withSite()
    const tracking = createImportTrackingStore({ db })
    const run = await tracking.createRun({ source: 'csv', createdBy: null, analysis: null })
    const store = createContentStore({ db, collection: note })
    const mapping = proposeFieldMapping(['Title'], note)
    const records = [
      { sourceId: '1', values: { Title: 'Hello' } },
      { sourceId: '2', values: { Title: 'World' } },
    ]

    const first = await applyGeneric({
      records,
      mapping,
      collections: [note],
      storeFor: () => store,
      tracking,
      runId: run.id,
      createdBy: null,
    })
    expect(first.imported).toBe(2)

    // Simulate re-running the same apply after an interruption.
    const second = await applyGeneric({
      records,
      mapping,
      collections: [note],
      storeFor: () => store,
      tracking,
      runId: run.id,
      createdBy: null,
    })
    expect(second.imported).toBe(0)
    expect(second.resumedSkips).toBe(2)

    const list = await store.list({ state: 'working' })
    expect(list.items).toHaveLength(2)
  })
})
