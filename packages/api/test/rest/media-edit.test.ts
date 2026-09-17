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
import {
  focalBeforeEdit,
  focalThroughEdit,
  type ImageEdit,
  isIdentityEdit,
  originalCopyKey,
  parseImageEdit,
} from '../../src/rest/media-edit.js'
import {
  createMediaRouter,
  type MediaImageProcessor,
  type MediaRouter,
} from '../../src/rest/media-router.js'
import { type Actor, ANONYMOUS } from '../../src/types.js'

/**
 * L39: an image is turned and cropped in place, always from its untouched
 * original, and can be put back. The processor here is a stand-in that writes
 * which edit it applied after the bytes it was given — so a test reads, from
 * the stored file, what the edit started from.
 */

const EDITOR = { id: 'user-1', roles: ['editor'] }
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const marker = (edit: ImageEdit): string => `|edit:${edit.rotate}:${JSON.stringify(edit.crop)}`

function editingProcessor(): MediaImageProcessor {
  return {
    probe: async () => ({ width: 800, height: 600 }),
    variants: async () => [],
    variantNames: () => [],
    edit: async (bytes, edit) => ({
      bytes: Buffer.concat([Buffer.from(bytes), Buffer.from(marker(edit))]),
      contentType: 'image/png',
    }),
  }
}

let db: DatabaseHandle
let store: MediaStore
let storage: StorageDriver
let root: string

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  store = createDatabaseMediaStore({ db })
  root = await mkdtemp(join(tmpdir(), 'cogenta-media-edit-'))
  storage = createLocalStorage({ path: root })
})

afterEach(async () => {
  await db.close()
  await rm(root, { recursive: true, force: true })
})

async function upload(router: MediaRouter): Promise<string> {
  const response = await router.handle(
    {
      method: 'POST',
      path: '/api/media',
      query: {},
      body: {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        data: PNG.toString('base64'),
        alt: 'x',
      },
    },
    EDITOR,
  )
  return (response.body as { data: { id: string } }).data.id
}

async function fileOf(id: string): Promise<Buffer> {
  const asset = await store.get(id)
  const chunks: Buffer[] = []
  for await (const chunk of await storage.get(asset?.storageKey as string))
    chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

const post = (router: MediaRouter, path: string, body?: unknown, actor: Actor = EDITOR) =>
  router.handle({ method: 'POST', path, query: {}, body }, actor)

describe('the focal point through an edit', () => {
  it('turns with the picture, lands inside the crop, and comes back the same way', () => {
    const turn: ImageEdit = { rotate: 90, crop: null }
    expect(focalThroughEdit({ x: 0.25, y: 0.5 }, turn)).toEqual({ x: 0.5, y: 0.25 })
    expect(focalBeforeEdit({ x: 0.5, y: 0.25 }, turn)).toEqual({ x: 0.25, y: 0.5 })

    const cropped: ImageEdit = { rotate: 0, crop: { x: 0.5, y: 0, width: 0.5, height: 1 } }
    expect(focalThroughEdit({ x: 0.75, y: 0.5 }, cropped)).toEqual({ x: 0.5, y: 0.5 })
    expect(focalThroughEdit({ x: 0.25, y: 0.5 }, cropped)).toBeNull()

    for (const rotate of [0, 90, 180, 270] as const) {
      const edit: ImageEdit = { rotate, crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 } }
      const through = focalThroughEdit({ x: 0.4, y: 0.45 }, edit)
      const back = focalBeforeEdit(through, edit)
      expect(back?.x).toBeCloseTo(0.4)
      expect(back?.y).toBeCloseTo(0.45)
    }
  })

  it('refuses a crop outside the picture or a turn that is not a quarter', () => {
    expect(() => parseImageEdit({ rotate: 45 })).toThrow()
    expect(() =>
      parseImageEdit({ rotate: 0, crop: { x: 0.6, y: 0, width: 0.5, height: 1 } }),
    ).toThrow()
    expect(isIdentityEdit(parseImageEdit({ rotate: 0 }))).toBe(true)
  })
})

describe('POST /api/media/{id}/edit and /restore', () => {
  it('edits from the original every time, and puts the original back', async () => {
    const router = createMediaRouter({ store, storage, images: editingProcessor() })
    const id = await upload(router)
    const first: ImageEdit = { rotate: 90, crop: null }
    const second: ImageEdit = { rotate: 0, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }

    const edited = await post(router, `/api/media/${id}/edit`, first)
    expect(edited.status).toBe(200)
    expect((edited.body as { data: { edited: boolean } }).data.edited).toBe(true)
    expect((await fileOf(id)).toString('latin1')).toBe(PNG.toString('latin1') + marker(first))

    await post(router, `/api/media/${id}/edit`, second)
    // Not "first then second": the second edit started from the original.
    expect((await fileOf(id)).toString('latin1')).toBe(PNG.toString('latin1') + marker(second))

    const read = await router.handle({ method: 'GET', path: `/api/media/${id}`, query: {} }, EDITOR)
    expect((read.body as { data: { edited: boolean } }).data.edited).toBe(true)

    const restored = await post(router, `/api/media/${id}/restore`)
    expect((restored.body as { data: { edited: boolean } }).data.edited).toBe(false)
    expect((await fileOf(id)).equals(PNG)).toBe(true)
    expect(await storage.exists(originalCopyKey(id))).toBe(false)
  })

  it('keeps the file when the same edit is applied twice — the bytes land under the same key', async () => {
    const router = createMediaRouter({ store, storage, images: editingProcessor() })
    const id = await upload(router)
    const edit: ImageEdit = { rotate: 180, crop: null }
    await post(router, `/api/media/${id}/edit`, edit)
    await post(router, `/api/media/${id}/edit`, edit)
    expect((await fileOf(id)).toString('latin1')).toBe(PNG.toString('latin1') + marker(edit))
  })

  it('carries the focal point through successive edits and back', async () => {
    const router = createMediaRouter({ store, storage, images: editingProcessor() })
    const id = await upload(router)
    await store.update(id, { focal: { x: 0.25, y: 0.5 } })

    await post(router, `/api/media/${id}/edit`, { rotate: 90 })
    expect((await store.get(id))?.focal).toEqual({ x: 0.5, y: 0.25 })

    await post(router, `/api/media/${id}/edit`, { rotate: 180 })
    expect((await store.get(id))?.focal).toEqual({ x: 0.75, y: 0.5 })

    await post(router, `/api/media/${id}/restore`)
    expect((await store.get(id))?.focal).toEqual({ x: 0.25, y: 0.5 })
  })

  it('forgets the original once a new file replaces the edited one', async () => {
    const router = createMediaRouter({ store, storage, images: editingProcessor() })
    const id = await upload(router)
    await post(router, `/api/media/${id}/edit`, { rotate: 90 })
    const replaced = await post(router, `/api/media/${id}/replace`, {
      fields: {},
      files: [{ fieldName: 'file', filename: 'b.png', mimeType: 'image/png', data: PNG }],
    })
    expect(replaced.status).toBe(200)
    expect(await storage.exists(originalCopyKey(id))).toBe(false)
  })

  it('refuses a visitor, and says so when the host cannot edit images', async () => {
    const router = createMediaRouter({ store, storage, images: editingProcessor() })
    const id = await upload(router)
    expect((await post(router, `/api/media/${id}/edit`, { rotate: 90 }, ANONYMOUS)).status).toBe(
      401,
    )

    const withoutEdit = createMediaRouter({ store, storage })
    const unavailable = await post(withoutEdit, `/api/media/${id}/edit`, { rotate: 90 })
    expect(unavailable.status).toBe(501)
  })
})

describe('replacing a file with the very same bytes', () => {
  it('keeps the file — its key does not change, so it is not "the old one" to delete', async () => {
    const router = createMediaRouter({ store, storage })
    const id = await upload(router)
    const same = {
      fields: {},
      files: [{ fieldName: 'file', filename: 'a.png', mimeType: 'image/png', data: PNG }],
    }
    // The first replace moves the file under a key named by its hash; the
    // second lands on that very key.
    expect((await post(router, `/api/media/${id}/replace`, same)).status).toBe(200)
    expect((await post(router, `/api/media/${id}/replace`, same)).status).toBe(200)
    expect((await fileOf(id)).equals(PNG)).toBe(true)
  })
})
