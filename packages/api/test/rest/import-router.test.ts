import { describe, expect, it } from 'vitest'
import { createImportRouter, type ImportReportLike } from '../../src/rest/import-router.js'
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
