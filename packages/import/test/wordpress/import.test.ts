import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabaseRegistry, createLocalStorage, createLogger } from '@cogenta/core'
import { createContentStore } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { wpCategory, wpComment, wpPage, wpPost, wpTag } from '../../src/wordpress/collections.js'
import { importWordPress } from '../../src/wordpress/import.js'

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url))

/** A tiny 1x1 GIF — real bytes, so `MediaStore.create` sees a real size/mime type, not a stub. */
const FAKE_IMAGE_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7',
  'base64',
)

function fakeFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('gone.jpg')) {
      return new Response('not found', { status: 404 })
    }
    return new Response(FAKE_IMAGE_BYTES, {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })
  }) as typeof fetch
}

describe('importWordPress', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function withSite() {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-import-'))
    dirs.push(dir)
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(dir, 'site.db'),
    })
    const storage = createLocalStorage({ path: join(dir, 'media') })
    return { db: selection.instance, storage, dispose: selection.dispose }
  }

  it('imports a real-shaped WXR export end to end, with a report of what could not be converted', async () => {
    const xml = await readFile(join(FIXTURES, 'full-featured.xml'), 'utf8')
    const { db, storage, dispose } = await withSite()

    try {
      const report = await importWordPress(xml, { db, storage, fetchImpl: fakeFetch() })

      // Posts: "Hello, Cogenta" (publish) and "Ghost-written notes" (draft) —
      // "Trashed draft" is reported, not written.
      expect(report.imported.posts).toBe(2)
      expect(report.imported.pages).toBe(1)
      expect(report.imported.categories).toBe(1)
      expect(report.imported.tags).toBe(1)
      expect(report.imported.authors).toBe(2)
      expect(report.imported.comments).toBe(1) // the spam comment is not approved

      expect(report.skipped).toEqual([
        expect.objectContaining({ type: 'post', wpId: '3', title: 'Trashed draft' }),
      ])

      // The unmappable wp:acme/fancy-widget block is reported, not stored as HTML.
      expect(report.unconvertedBlocks.some((note) => note.source === 'wp:acme/fancy-widget')).toBe(
        true,
      )
      // The gallery's dead image URL is reported.
      expect(report.warnings.some((warning) => warning.includes('gone.jpg'))).toBe(true)
      // The author with no email in the export gets a synthesised placeholder, and it is reported.
      expect(
        report.warnings.some(
          (warning) => warning.includes('Ghost Writer') === false && warning.includes('ghost'),
        ),
      ).toBe(true)

      expect(report.redirectsCreated).toBeGreaterThanOrEqual(1)

      const postStore = createContentStore({ db, collection: wpPost })
      const posts = await postStore.list({ state: 'working' })
      const hello = posts.items.find((entry) => entry.values['slug'] === 'hello-cogenta')
      expect(hello).toBeDefined()
      if (hello === undefined) throw new Error('unreachable')
      expect(hello.status).toBe('published')
      expect(hello.values['publishedAt']).toBe('2026-01-01T12:00:00.000Z')
      expect(hello.values['customFields']).toEqual({ seo_focus_keyword: 'cogenta' })

      const blocks = hello.blocks['body'] ?? []
      const types = blocks.map((block) => block.type)
      expect(types).toContain('prose')
      expect(types).toContain('mediaFigure')
      expect(types).toContain('quote')
      expect(types).toContain('embed')
      // The unmappable custom block never made it into storage.
      expect(types).not.toContain('acme/fancy-widget')

      const mediaFigure = blocks.find((block) => block.type === 'mediaFigure')
      expect(mediaFigure).toBeDefined()
      if (mediaFigure === undefined) throw new Error('unreachable')
      // The URL placeholder was resolved to a real MediaAsset id, not left as a URL.
      expect(mediaFigure.data['media']).not.toContain('http')

      const draftPost = posts.items.find((entry) => entry.values['slug'] === 'ghost-notes')
      expect(draftPost?.status).toBe('draft')
      // Its gallery lost its dead image but kept the live one.
      const galleryBlocks = draftPost?.blocks['body'] ?? []
      const gallery = galleryBlocks.find((block) => block.type === 'gallery')
      expect(gallery).toBeDefined()
      if (gallery === undefined) throw new Error('unreachable')
      expect((gallery.data['items'] as unknown[]).length).toBe(1)

      const pageStore = createContentStore({ db, collection: wpPage })
      const about = (await pageStore.list()).items.find((entry) => entry.values['slug'] === 'about')
      expect(about).toBeDefined()

      const categoryStore = createContentStore({ db, collection: wpCategory })
      const categories = await categoryStore.list()
      expect(categories.items.map((entry) => entry.values['slug'])).toEqual(['news'])

      const tagStore = createContentStore({ db, collection: wpTag })
      const tags = await tagStore.list()
      expect(tags.items.map((entry) => entry.values['slug'])).toEqual(['cms'])

      const commentStore = createContentStore({ db, collection: wpComment })
      const comments = await commentStore.list()
      expect(comments.items).toHaveLength(1)
      expect(comments.items[0]?.values['author']).toBe('Jane & Reader')
    } finally {
      await dispose()
    }
  })

  it('imports a classic-editor-only export with no Gutenberg blocks at all', async () => {
    const xml = await readFile(join(FIXTURES, 'classic-minimal.xml'), 'utf8')
    const { db, storage, dispose } = await withSite()

    try {
      const report = await importWordPress(xml, { db, storage, fetchImpl: fakeFetch() })
      expect(report.imported.posts).toBe(1)
      expect(report.imported.authors).toBe(1)

      const postStore = createContentStore({ db, collection: wpPost })
      const [post] = (await postStore.list()).items
      expect(post?.values['slug']).toBe('a-note-from-the-archives')
      const blocks = post?.blocks['body'] ?? []
      expect(blocks.map((block) => block.type)).toEqual(['prose'])
    } finally {
      await dispose()
    }
  })

  it('is safe to feed it a hostile DOCTYPE without following the ENTITY', async () => {
    const { db, storage, dispose } = await withSite()
    const hostile =
      '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss version="2.0"><channel><item><wp:post_type xmlns:wp="x">post</wp:post_type></item></channel></rss>'
    try {
      await expect(
        importWordPress(hostile, { db, storage, fetchImpl: fakeFetch() }),
      ).rejects.toThrow(/ENTITY/)
    } finally {
      await dispose()
    }
  })
})
