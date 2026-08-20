import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CogentaError, createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore, createSchemaTables, defineCollection, f } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeJson, applyJson, parseJsonImport } from '../src/json-import.js'
import { createImportTrackingStore } from '../src/tracking.js'

const note = defineCollection({
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
  },
  permissions: { read: ['public'], create: ['admin'], update: ['admin'], delete: ['admin'] },
})

describe('parseJsonImport', () => {
  it('reads one record per non-empty line', () => {
    const text = [
      '{"collection":"note","values":{"title":"Hello"}}',
      '',
      '{"collection":"note","id":"n1","status":"published","values":{"title":"World"}}',
    ].join('\n')
    const records = parseJsonImport(text)
    expect(records).toHaveLength(2)
    expect(records[1]).toEqual({
      collection: 'note',
      id: 'n1',
      status: 'published',
      values: { title: 'World' },
    })
  })

  it('rejects a line that is not a JSON object', () => {
    expect(() => parseJsonImport('not json')).toThrow(CogentaError)
  })

  it('rejects a line missing "collection"', () => {
    expect(() => parseJsonImport('{"values":{}}')).toThrow(CogentaError)
  })
})

describe('analyzeJson', () => {
  it('tallies records by collection and names an undeclared one', () => {
    const records = parseJsonImport(
      ['{"collection":"note","values":{"title":"a"}}', '{"collection":"ghost","values":{}}'].join(
        '\n',
      ),
    )
    const report = analyzeJson(records, [note])
    expect(report.totalRecords).toBe(2)
    expect(report.byCollection).toEqual({ note: 1, ghost: 1 })
    expect(report.unknownCollections).toEqual(['ghost'])
    expect(report.warnings).toHaveLength(1)
  })
})

describe('applyJson', () => {
  const dirs: string[] = []
  const disposers: (() => Promise<void>)[] = []

  afterEach(async () => {
    await Promise.all(disposers.splice(0).map((dispose) => dispose()))
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function withSite() {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-json-import-'))
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

  it('writes known-collection records and reports an unknown collection as an error, not a crash', async () => {
    const db = await withSite()
    const tracking = createImportTrackingStore({ db })
    const run = await tracking.createRun({ source: 'json', createdBy: null, analysis: null })
    const store = createContentStore({ db, collection: note })

    const records = parseJsonImport(
      [
        '{"collection":"note","values":{"title":"Hello"}}',
        '{"collection":"ghost","values":{"x":1}}',
      ].join('\n'),
    )

    const report = await applyJson({
      records,
      collections: [note],
      storeFor: () => store,
      tracking,
      runId: run.id,
      createdBy: null,
    })

    expect(report.imported).toBe(1)
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0]?.message).toContain('ghost')

    const list = await store.list({ state: 'working' })
    expect(list.items.map((entry) => entry.values.title)).toEqual(['Hello'])
  })

  it('resumes without duplicating an already-recorded record', async () => {
    const db = await withSite()
    const tracking = createImportTrackingStore({ db })
    const run = await tracking.createRun({ source: 'json', createdBy: null, analysis: null })
    const store = createContentStore({ db, collection: note })
    const records = parseJsonImport(
      '{"collection":"note","id":"stable-1","values":{"title":"Hello"}}',
    )

    const options = {
      records,
      collections: [note],
      storeFor: () => store,
      tracking,
      runId: run.id,
      createdBy: null,
    }

    const first = await applyJson(options)
    expect(first.imported).toBe(1)

    const second = await applyJson(options)
    expect(second.imported).toBe(0)
    expect(second.resumedSkips).toBe(1)

    const list = await store.list({ state: 'working' })
    expect(list.items).toHaveLength(1)
  })
})
