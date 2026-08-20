import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDatabaseMediaStore,
  createLocalStorage,
  createSqliteHandle,
  type DatabaseHandle,
  type MediaStore,
  type StorageDriver,
} from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMediaRouter, type MediaRouter } from '../../src/rest/media-router.js'
import { ANONYMOUS } from '../../src/types.js'

const EDITOR = { id: 'user-1', roles: ['editor'] }

// A 1x1 transparent PNG, real magic bytes and all — this is exactly what the
// route's real-type check reads, so a fixture with a fake signature would
// test nothing.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

let db: DatabaseHandle
let store: MediaStore
let storage: StorageDriver
let router: MediaRouter
let storageRoot: string

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  store = createDatabaseMediaStore({ db })
  storageRoot = await mkdtemp(join(tmpdir(), 'cogenta-media-router-'))
  storage = createLocalStorage({ path: storageRoot })
  router = createMediaRouter({ store, storage })
})

afterEach(async () => {
  await db.close()
  await rm(storageRoot, { recursive: true, force: true })
})

describe('POST /api/media', () => {
  it('refuses an anonymous upload', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: 'x',
        },
      },
      ANONYMOUS,
    )
    expect(response.status).toBe(401)
  })

  it('stores a real image and creates its asset record', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'cover photo.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: 'A single transparent pixel',
        },
      },
      EDITOR,
    )
    expect(response.status).toBe(201)
    const body = response.body as { data: { id: string; alt: string; storageKey: string } }
    expect(body.data.alt).toBe('A single transparent pixel')
    expect(await storage.exists(body.data.storageKey)).toBe(true)
  })

  it('refuses a disguised file whose declared kind is image but whose bytes are not', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'not-really.png',
          mimeType: 'image/png',
          data: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),
          alt: 'x',
        },
      },
      EDITOR,
    )
    expect(response.status).toBe(400)
    const body = response.body as { error: { code: string; message: string } }
    expect(body.error.code).toBe('MEDIA_TYPE_REJECTED')
    expect(body.error.message).toContain('SVG')
  })

  it('refuses a non-decorative upload with empty alt text, and does not leave an orphaned blob', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: '',
        },
      },
      EDITOR,
    )
    expect(response.status).toBe(400)
    expect(await store.list()).toEqual({ items: [], hasMore: false, nextCursor: null })
  })

  it('accepts a decorative upload with a justification, writing an empty alt', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'divider.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          decorative: true,
          decorativeJustification: 'Purely ornamental section divider.',
        },
      },
      EDITOR,
    )
    expect(response.status).toBe(201)
    const body = response.body as { data: { alt: string; decorative: boolean } }
    expect(body.data.alt).toBe('')
    expect(body.data.decorative).toBe(true)
  })

  it('honours a configured upload size ceiling (fiche 23 task 2), read fresh per request', async () => {
    // The fixture PNG above is well under any real ceiling; a ceiling of a
    // single byte is what proves this is actually enforced rather than a
    // no-op wrapper around the fixed default.
    const tinyLimitRouter = createMediaRouter({
      store,
      storage,
      maxUploadBytes: async () => 1,
    })
    const response = await tinyLimitRouter.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: 'x',
        },
      },
      EDITOR,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('MEDIA_INVALID')
  })
})

describe('GET /api/media and /api/media/{id}', () => {
  it('lists and reads back an uploaded asset', async () => {
    const uploaded = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: 'x',
        },
      },
      EDITOR,
    )
    const id = (uploaded.body as { data: { id: string } }).data.id

    const listed = await router.handle({ method: 'GET', path: '/api/media', query: {} }, EDITOR)
    expect((listed.body as { data: unknown[] }).data).toHaveLength(1)

    const read = await router.handle({ method: 'GET', path: `/api/media/${id}`, query: {} }, EDITOR)
    expect((read.body as { data: { id: string } }).data.id).toBe(id)
  })

  it('reports 404 for an unknown id', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/media/does-not-exist', query: {} },
      EDITOR,
    )
    expect(response.status).toBe(404)
  })

  it('filters by a substring of the filename or alt text with `q`, case-insensitively', async () => {
    await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'cathedral-sunrise.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: 'A cathedral at sunrise',
        },
      },
      EDITOR,
    )
    await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'harbor.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: 'A quiet harbor at dusk',
        },
      },
      EDITOR,
    )

    const byFilename = await router.handle(
      { method: 'GET', path: '/api/media', query: { q: 'CATHEDRAL' } },
      EDITOR,
    )
    const filenameHits = (byFilename.body as { data: { filename: string }[] }).data
    expect(filenameHits).toHaveLength(1)
    expect(filenameHits[0]?.filename).toBe('cathedral-sunrise.png')

    const byAlt = await router.handle(
      { method: 'GET', path: '/api/media', query: { q: 'dusk' } },
      EDITOR,
    )
    const altHits = (byAlt.body as { data: { filename: string }[] }).data
    expect(altHits).toHaveLength(1)
    expect(altHits[0]?.filename).toBe('harbor.png')

    const noMatch = await router.handle(
      { method: 'GET', path: '/api/media', query: { q: 'nonexistent' } },
      EDITOR,
    )
    expect((noMatch.body as { data: unknown[] }).data).toHaveLength(0)
  })

  it('refuses an anonymous `q` search the same way it refuses every other list', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/media', query: { q: 'anything' } },
      ANONYMOUS,
    )
    expect(response.status).toBe(401)
  })
})

describe('PATCH /api/media/{id}', () => {
  it('updates the focal point', async () => {
    const uploaded = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: 'x',
        },
      },
      EDITOR,
    )
    const id = (uploaded.body as { data: { id: string } }).data.id

    const response = await router.handle(
      {
        method: 'PATCH',
        path: `/api/media/${id}`,
        query: {},
        body: { focal: { x: 0.25, y: 0.75 } },
      },
      EDITOR,
    )
    expect((response.body as { data: { focal: unknown } }).data.focal).toEqual({ x: 0.25, y: 0.75 })
  })

  it('refuses an anonymous edit', async () => {
    const response = await router.handle(
      { method: 'PATCH', path: '/api/media/anything', query: {}, body: { alt: 'x' } },
      ANONYMOUS,
    )
    expect(response.status).toBe(401)
  })
})

describe('DELETE /api/media/{id}', () => {
  it('removes both the record and the stored blob', async () => {
    const uploaded = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: 'x',
        },
      },
      EDITOR,
    )
    const body = uploaded.body as { data: { id: string; storageKey: string } }

    const response = await router.handle(
      { method: 'DELETE', path: `/api/media/${body.data.id}`, query: {} },
      EDITOR,
    )
    expect(response.status).toBe(204)
    expect(await store.get(body.data.id)).toBeNull()
    expect(await storage.exists(body.data.storageKey)).toBe(false)
  })
})
