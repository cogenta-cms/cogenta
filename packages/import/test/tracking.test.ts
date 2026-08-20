import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createImportTrackingStore } from '../src/tracking.js'

describe('createImportTrackingStore', () => {
  const dirs: string[] = []
  const disposers: (() => Promise<void>)[] = []

  afterEach(async () => {
    await Promise.all(disposers.splice(0).map((dispose) => dispose()))
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function withDb() {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-import-tracking-'))
    dirs.push(dir)
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(dir, 'site.db'),
    })
    disposers.push(selection.dispose)
    return selection.instance
  }

  it('creates a run in "analyzed" status, readable back by id', async () => {
    const db = await withDb()
    const tracking = createImportTrackingStore({ db })

    const run = await tracking.createRun({
      source: 'csv',
      createdBy: 'user-1',
      analysis: { totalRecords: 3 },
    })

    expect(run.status).toBe('analyzed')
    expect(run.source).toBe('csv')
    expect(run.analysis).toEqual({ totalRecords: 3 })

    const found = await tracking.getRun(run.id)
    expect(found).toEqual(run)
  })

  it('returns null for an unknown run id', async () => {
    const db = await withDb()
    const tracking = createImportTrackingStore({ db })
    expect(await tracking.getRun('does-not-exist')).toBeNull()
  })

  it('updates status, progress and report in place', async () => {
    const db = await withDb()
    const tracking = createImportTrackingStore({ db })
    const run = await tracking.createRun({ source: 'wordpress', createdBy: null, analysis: null })

    const updated = await tracking.updateRun(run.id, {
      status: 'running',
      progress: { processed: 5, total: 10 },
    })
    expect(updated.status).toBe('running')
    expect(updated.progress).toEqual({ processed: 5, total: 10 })

    const done = await tracking.updateRun(run.id, { status: 'done', report: { imported: 10 } })
    expect(done.status).toBe('done')
    expect(done.report).toEqual({ imported: 10 })
    // Progress survives an update that does not touch it.
    expect(done.progress).toEqual({ processed: 5, total: 10 })
  })

  it('records an item once per (runId, sourceId), silently ignoring a repeat', async () => {
    const db = await withDb()
    const tracking = createImportTrackingStore({ db })
    const run = await tracking.createRun({ source: 'csv', createdBy: null, analysis: null })

    await tracking.recordItem({ runId: run.id, sourceId: '1', collection: 'post', entryId: 'e1' })
    await tracking.recordItem({ runId: run.id, sourceId: '1', collection: 'post', entryId: 'e1' })
    await tracking.recordItem({ runId: run.id, sourceId: '2', collection: 'post', entryId: 'e2' })

    const items = await tracking.listItems(run.id)
    expect(items).toHaveLength(2)

    const done = await tracking.doneSourceIds(run.id)
    expect(done).toEqual(new Set(['1', '2']))
  })

  it('scopes doneSourceIds to one run — a second run starts with none', async () => {
    const db = await withDb()
    const tracking = createImportTrackingStore({ db })
    const runA = await tracking.createRun({ source: 'csv', createdBy: null, analysis: null })
    const runB = await tracking.createRun({ source: 'csv', createdBy: null, analysis: null })

    await tracking.recordItem({ runId: runA.id, sourceId: '1', collection: 'post', entryId: 'e1' })

    expect(await tracking.doneSourceIds(runB.id)).toEqual(new Set())
  })

  it('lists runs newest first', async () => {
    const db = await withDb()
    let clock = 1_700_000_000_000
    const tracking = createImportTrackingStore({ db, now: () => clock++ })
    const first = await tracking.createRun({ source: 'csv', createdBy: null, analysis: null })
    const second = await tracking.createRun({ source: 'json', createdBy: null, analysis: null })

    const runs = await tracking.listRuns()
    expect(runs.map((r) => r.id)).toEqual([second.id, first.id])
  })
})
