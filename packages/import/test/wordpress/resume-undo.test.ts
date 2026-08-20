import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabaseRegistry, createLocalStorage, createLogger } from '@cogenta/core'
import { createContentStore } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createImportTrackingStore } from '../../src/tracking.js'
import { undoImport } from '../../src/undo.js'
import { wpComment, wpPage, wpPost } from '../../src/wordpress/collections.js'
import { importWordPress } from '../../src/wordpress/import.js'

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url))

const FAKE_IMAGE_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7',
  'base64',
)

function fakeFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('gone.jpg')) return new Response('not found', { status: 404 })
    return new Response(FAKE_IMAGE_BYTES, {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })
  }) as typeof fetch
}

describe('importWordPress resume and undoImport', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function withSite() {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-import-resume-'))
    dirs.push(dir)
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(dir, 'site.db'),
    })
    const storage = createLocalStorage({ path: join(dir, 'media') })
    return { db: selection.instance, storage, dispose: selection.dispose }
  }

  it('a second apply of the same run does not duplicate posts, pages or comments', async () => {
    const xml = await readFile(join(FIXTURES, 'full-featured.xml'), 'utf8')
    const { db, storage, dispose } = await withSite()

    try {
      const tracking = createImportTrackingStore({ db })
      const run = await tracking.createRun({ source: 'wordpress', createdBy: null, analysis: null })

      const first = await importWordPress(xml, {
        db,
        storage,
        fetchImpl: fakeFetch(),
        tracking,
        runId: run.id,
      })
      expect(first.imported.posts).toBe(2)
      expect(first.imported.comments).toBe(1)

      // Simulate the process being interrupted and the same apply re-run.
      const second = await importWordPress(xml, {
        db,
        storage,
        fetchImpl: fakeFetch(),
        tracking,
        runId: run.id,
      })
      expect(second.imported.posts).toBe(0)
      expect(second.imported.pages).toBe(0)
      expect(second.imported.comments).toBe(0)
      expect(second.warnings.some((w) => w.includes('Resumed'))).toBe(true)

      const postStore = createContentStore({ db, collection: wpPost })
      const posts = await postStore.list({ state: 'working' })
      // Still exactly 2 — resume did not create a second copy of anything.
      expect(posts.items).toHaveLength(2)

      const commentStore = createContentStore({ db, collection: wpComment })
      const comments = await commentStore.list({ state: 'working' })
      expect(comments.items).toHaveLength(1)
    } finally {
      await dispose()
    }
  })

  it('undoes an import by trashing every entry it created, restorable with untrash', async () => {
    const xml = await readFile(join(FIXTURES, 'full-featured.xml'), 'utf8')
    const { db, storage, dispose } = await withSite()

    try {
      const tracking = createImportTrackingStore({ db })
      const run = await tracking.createRun({ source: 'wordpress', createdBy: null, analysis: null })
      await importWordPress(xml, { db, storage, fetchImpl: fakeFetch(), tracking, runId: run.id })

      const postStore = createContentStore({ db, collection: wpPost })
      const pageStore = createContentStore({ db, collection: wpPage })
      const commentStore = createContentStore({ db, collection: wpComment })

      const before = await postStore.list({ state: 'working' })
      expect(before.items).toHaveLength(2)

      const undoReport = await undoImport({
        tracking,
        runId: run.id,
        storeFor: (name) =>
          name === wpPost.name ? postStore : name === wpPage.name ? pageStore : commentStore,
      })

      // 2 posts + 1 page + 1 comment = 4 items recorded for this run.
      expect(undoReport.trashed).toBe(4)
      expect(undoReport.failed).toEqual([])

      const afterTrash = await postStore.list({ state: 'working' })
      expect(afterTrash.items).toHaveLength(0)

      const trashedOnly = await postStore.list({ state: 'working', trashed: 'only' })
      expect(trashedOnly.items).toHaveLength(2)

      // Restorable: untrash gives back exactly what was taken.
      const [firstTrashed] = trashedOnly.items
      if (firstTrashed === undefined) throw new Error('unreachable')
      const restored = await postStore.untrash(firstTrashed.id)
      expect(restored.status).toBe(firstTrashed.status)
      expect(restored.values['title']).toBe(firstTrashed.values['title'])

      const run2 = await tracking.getRun(run.id)
      expect(run2?.status).toBe('cancelled')
    } finally {
      await dispose()
    }
  })
})
