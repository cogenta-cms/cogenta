import { describe, expect, it } from 'vitest'
import {
  createImportRouter,
  type ImportReportLike,
  type ImportRunLike,
} from '../../src/rest/import-router.js'
import type { Actor } from '../../src/types.js'

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const ANONYMOUS: Actor = { id: null, roles: ['public'] }

const REPORT: ImportReportLike = {
  imported: { posts: 2, pages: 1, categories: 1, tags: 0, media: 0, authors: 1, comments: 0 },
  redirectsCreated: 1,
  skipped: [],
  unconvertedBlocks: [],
  warnings: [],
}

function router(overrides: { runWordPressImport?(xml: string): Promise<ImportReportLike> } = {}) {
  const calls: string[] = []
  const runWordPressImport =
    overrides.runWordPressImport ??
    (async (xml: string) => {
      calls.push(xml)
      return REPORT
    })
  return { router: createImportRouter({ runWordPressImport }), calls }
}

describe('createImportRouter', () => {
  it('refuses a non-admin actor without ever calling the importer', async () => {
    const { router: importRouter, calls } = router()
    const response = await importRouter.handle(
      {
        method: 'POST',
        path: '/api/import/wordpress',
        query: {},
        body: { filename: 'export.xml', data: Buffer.from('<rss></rss>').toString('base64') },
      },
      EDITOR,
    )
    expect(response.status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it('refuses an anonymous actor', async () => {
    const { router: importRouter } = router()
    const response = await importRouter.handle(
      { method: 'POST', path: '/api/import/wordpress', query: {} },
      ANONYMOUS,
    )
    expect(response.status).toBe(403)
  })

  it('decodes the uploaded base64 and hands the admin importer real XML text', async () => {
    const { router: importRouter, calls } = router()
    const xml = '<rss><channel><title>My blog</title></channel></rss>'
    const response = await importRouter.handle(
      {
        method: 'POST',
        path: '/api/import/wordpress',
        query: {},
        body: { filename: 'export.xml', data: Buffer.from(xml, 'utf8').toString('base64') },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: ImportReportLike }).data).toEqual(REPORT)
    expect(calls).toEqual([xml])
  })

  it('rejects a request naming no file', async () => {
    const { router: importRouter } = router()
    const response = await importRouter.handle(
      { method: 'POST', path: '/api/import/wordpress', query: {}, body: {} },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })

  it('rejects a file whose data is not valid base64', async () => {
    const { router: importRouter } = router()
    const response = await importRouter.handle(
      {
        method: 'POST',
        path: '/api/import/wordpress',
        query: {},
        body: { filename: 'export.xml', data: '!!!!!!!!' },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })

  it('rejects an upload larger than the route accepts', async () => {
    const { router: importRouter } = router()
    const huge = 'A'.repeat(40 * 1024 * 1024 + 1)
    const response = await importRouter.handle(
      {
        method: 'POST',
        path: '/api/import/wordpress',
        query: {},
        body: { filename: 'export.xml', data: huge },
      },
      ADMIN,
    )
    expect(response.status).toBe(413)
  })

  it('answers 405 on a method other than POST', async () => {
    const { router: importRouter } = router()
    const response = await importRouter.handle(
      { method: 'GET', path: '/api/import/wordpress', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(405)
  })

  it('answers 404 on an unknown import route', async () => {
    const { router: importRouter } = router()
    const response = await importRouter.handle(
      { method: 'POST', path: '/api/import/shopify', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })
})

const RUN: ImportRunLike = {
  id: 'run-1',
  source: 'csv',
  status: 'analyzed',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  analysis: { totalRecords: 2 },
  mapping: null,
  progress: { processed: 0, total: 2 },
  report: null,
  error: null,
}

describe('createImportRouter — preview/apply/status/undo (fiche 25)', () => {
  function fullRouter() {
    const calls: { analyze: unknown[]; apply: unknown[]; cancel: unknown[] } = {
      analyze: [],
      apply: [],
      cancel: [],
    }
    const importRouter = createImportRouter({
      runWordPressImport: async () => REPORT,
      analyze: async (input) => {
        calls.analyze.push(input)
        return RUN
      },
      apply: async (input) => {
        calls.apply.push(input)
        return { ...RUN, status: 'done', report: { imported: 2 } }
      },
      getRun: async (id) => (id === RUN.id ? RUN : null),
      listRuns: async () => [RUN],
      cancel: async (id) => {
        calls.cancel.push(id)
        return { ...RUN, status: 'cancelled' }
      },
    })
    return { importRouter, calls }
  }

  it('refuses a non-admin actor on every new route', async () => {
    const { importRouter } = fullRouter()
    for (const request of [
      { method: 'POST', path: '/api/import/analyze', query: {} },
      { method: 'GET', path: '/api/import/runs', query: {} },
      { method: 'GET', path: '/api/import/runs/run-1', query: {} },
      { method: 'POST', path: '/api/import/runs/run-1/apply', query: {} },
      { method: 'POST', path: '/api/import/runs/run-1/cancel', query: {} },
    ]) {
      const response = await importRouter.handle(request, EDITOR)
      expect(response.status).toBe(403)
    }
  })

  it('analyzes an uploaded CSV without applying it, returning the run', async () => {
    const { importRouter, calls } = fullRouter()
    const csv = 'title\nHello\n'
    const response = await importRouter.handle(
      {
        method: 'POST',
        path: '/api/import/analyze',
        query: {},
        body: {
          source: 'csv',
          filename: 'export.csv',
          data: Buffer.from(csv, 'utf8').toString('base64'),
        },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: ImportRunLike }).data).toEqual(RUN)
    expect(calls.analyze).toEqual([{ source: 'csv', text: csv, createdBy: ADMIN.id }])
  })

  it('rejects an analyze request naming an unknown source', async () => {
    const { importRouter } = fullRouter()
    const response = await importRouter.handle(
      {
        method: 'POST',
        path: '/api/import/analyze',
        query: {},
        body: { source: 'shopify', filename: 'x.csv', data: Buffer.from('a').toString('base64') },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })

  it('lists runs and reads one by id, 404ing on an unknown one', async () => {
    const { importRouter } = fullRouter()
    const list = await importRouter.handle(
      { method: 'GET', path: '/api/import/runs', query: {} },
      ADMIN,
    )
    expect(list.status).toBe(200)
    expect((list.body as { data: ImportRunLike[] }).data).toEqual([RUN])

    const found = await importRouter.handle(
      { method: 'GET', path: '/api/import/runs/run-1', query: {} },
      ADMIN,
    )
    expect(found.status).toBe(200)
    expect((found.body as { data: ImportRunLike }).data).toEqual(RUN)

    const missing = await importRouter.handle(
      { method: 'GET', path: '/api/import/runs/ghost', query: {} },
      ADMIN,
    )
    expect(missing.status).toBe(404)
  })

  it('applies a run, passing through an optional mapping, and the apply is idempotent to call again', async () => {
    const { importRouter, calls } = fullRouter()
    const mapping = { targetCollection: 'note', fields: { title: 'title' } }
    const response = await importRouter.handle(
      { method: 'POST', path: '/api/import/runs/run-1/apply', query: {}, body: { mapping } },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: ImportRunLike }).data.status).toBe('done')
    expect(calls.apply).toEqual([{ runId: 'run-1', mapping }])

    // A second call (simulating a resume) is the same route, same shape.
    const again = await importRouter.handle(
      { method: 'POST', path: '/api/import/runs/run-1/apply', query: {} },
      ADMIN,
    )
    expect(again.status).toBe(200)
    expect(calls.apply).toHaveLength(2)
  })

  it('cancels a run, trashing what it created', async () => {
    const { importRouter, calls } = fullRouter()
    const response = await importRouter.handle(
      { method: 'POST', path: '/api/import/runs/run-1/cancel', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: ImportRunLike }).data.status).toBe('cancelled')
    expect(calls.cancel).toEqual(['run-1'])
  })

  it('answers a clear error rather than 500 when the caller wired no preview/apply support', async () => {
    const bare = createImportRouter({ runWordPressImport: async () => REPORT })
    const response = await bare.handle(
      { method: 'POST', path: '/api/import/analyze', query: {}, body: { source: 'csv' } },
      ADMIN,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('IMPORT_SOURCE_INVALID')
  })

  it('rejects a method not allowed on the analyze and run routes', async () => {
    const { importRouter } = fullRouter()
    const badMethod = await importRouter.handle(
      { method: 'GET', path: '/api/import/analyze', query: {} },
      ADMIN,
    )
    expect(badMethod.status).toBe(405)

    const badApplyMethod = await importRouter.handle(
      { method: 'GET', path: '/api/import/runs/run-1/apply', query: {} },
      ADMIN,
    )
    expect(badApplyMethod.status).toBe(405)
  })
})
