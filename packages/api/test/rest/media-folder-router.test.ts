import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDatabaseMediaFolderStore,
  createDatabaseMediaStore,
  createLocalStorage,
  createSqliteHandle,
  type DatabaseHandle,
  type MediaFolderStore,
  type MediaStore,
  type StorageDriver,
} from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMediaRouter, type MediaRouter } from '../../src/rest/media-router.js'
import { ANONYMOUS } from '../../src/types.js'

const EDITOR = { id: 'user-1', roles: ['editor'] }

let db: DatabaseHandle
let store: MediaStore
let folders: MediaFolderStore
let storage: StorageDriver
let router: MediaRouter
let storageRoot: string

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  store = createDatabaseMediaStore({ db })
  folders = createDatabaseMediaFolderStore({ db })
  storageRoot = await mkdtemp(join(tmpdir(), 'cogenta-media-folder-router-'))
  storage = createLocalStorage({ path: storageRoot })
  router = createMediaRouter({ store, storage, folders })
})

afterEach(async () => {
  await db.close()
  await rm(storageRoot, { recursive: true, force: true })
})

describe('the folder routes without options.folders wired', () => {
  it('answer 404 rather than crashing — the same graceful absence usage/images already model', async () => {
    const unfoldered = createMediaRouter({ store, storage })
    const response = await unfoldered.handle(
      { method: 'GET', path: '/api/media/folders', query: {}, body: null },
      EDITOR,
    )
    expect(response.status).toBe(404)
  })
})

describe('POST /api/media/folders', () => {
  it('refuses an anonymous request', async () => {
    const response = await router.handle(
      { method: 'POST', path: '/api/media/folders', query: {}, body: { name: 'Contents' } },
      ANONYMOUS,
    )
    expect(response.status).toBe(401)
  })

  it('creates a root folder', async () => {
    const response = await router.handle(
      { method: 'POST', path: '/api/media/folders', query: {}, body: { name: 'Contents' } },
      EDITOR,
    )
    expect(response.status).toBe(201)
    const body = response.body as { data: { id: string; name: string; parentId: string | null } }
    expect(body.data.name).toBe('Contents')
    expect(body.data.parentId).toBeNull()
  })

  it('refuses two siblings sharing a name', async () => {
    await router.handle(
      { method: 'POST', path: '/api/media/folders', query: {}, body: { name: 'Contents' } },
      EDITOR,
    )
    const response = await router.handle(
      { method: 'POST', path: '/api/media/folders', query: {}, body: { name: 'Contents' } },
      EDITOR,
    )
    expect(response.status).toBe(409)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('MEDIA_FOLDER_NAME_TAKEN')
  })

  it('creates a subfolder given a parentId', async () => {
    const root = await folders.create({ name: 'Contents' })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media/folders',
        query: {},
        body: { name: 'Blog', parentId: root.id },
      },
      EDITOR,
    )
    expect(response.status).toBe(201)
    const body = response.body as { data: { parentId: string | null } }
    expect(body.data.parentId).toBe(root.id)
  })
})

describe('GET /api/media/folders', () => {
  it('returns the whole tree, and scopes to one level with ?parentId=', async () => {
    const root = await folders.create({ name: 'Contents' })
    const child = await folders.create({ name: 'Blog', parentId: root.id })
    const other = await folders.create({ name: 'Archive' })

    const whole = await router.handle(
      { method: 'GET', path: '/api/media/folders', query: {}, body: null },
      EDITOR,
    )
    const wholeBody = whole.body as { data: { id: string }[] }
    expect(new Set(wholeBody.data.map((f) => f.id))).toEqual(new Set([root.id, child.id, other.id]))

    const roots = await router.handle(
      { method: 'GET', path: '/api/media/folders', query: { parentId: '' }, body: null },
      EDITOR,
    )
    const rootsBody = roots.body as { data: { id: string }[] }
    expect(new Set(rootsBody.data.map((f) => f.id))).toEqual(new Set([root.id, other.id]))
  })
})

describe('PATCH /api/media/folders/{id}', () => {
  it('renames a folder', async () => {
    const folder = await folders.create({ name: 'Old name' })
    const response = await router.handle(
      {
        method: 'PATCH',
        path: `/api/media/folders/${folder.id}`,
        query: {},
        body: { name: 'New name' },
      },
      EDITOR,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { name: string } }
    expect(body.data.name).toBe('New name')
  })
})

describe('POST /api/media/folders/{id}/move', () => {
  it('re-parents a folder', async () => {
    const a = await folders.create({ name: 'A' })
    const b = await folders.create({ name: 'B' })
    const response = await router.handle(
      {
        method: 'POST',
        path: `/api/media/folders/${b.id}/move`,
        query: {},
        body: { parentId: a.id },
      },
      EDITOR,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { parentId: string | null } }
    expect(body.data.parentId).toBe(a.id)
  })

  it('refuses moving a folder into its own subtree', async () => {
    const root = await folders.create({ name: 'Root' })
    const child = await folders.create({ name: 'Child', parentId: root.id })
    const response = await router.handle(
      {
        method: 'POST',
        path: `/api/media/folders/${root.id}/move`,
        query: {},
        body: { parentId: child.id },
      },
      EDITOR,
    )
    expect(response.status).toBe(400)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('MEDIA_FOLDER_CYCLE')
  })
})

describe('DELETE /api/media/folders/{id}', () => {
  it('deletes an empty folder', async () => {
    const folder = await folders.create({ name: 'Temp' })
    const response = await router.handle(
      { method: 'DELETE', path: `/api/media/folders/${folder.id}`, query: {}, body: null },
      EDITOR,
    )
    expect(response.status).toBe(204)
    expect(await folders.read(folder.id)).toBeNull()
  })

  it('refuses deleting a folder that still holds a media asset', async () => {
    const folder = await folders.create({ name: 'Photos' })
    await store.create({
      kind: 'image',
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      size: 1,
      alt: 'a',
      storageKey: 'media/a.jpg',
      folderId: folder.id,
    })
    const response = await router.handle(
      { method: 'DELETE', path: `/api/media/folders/${folder.id}`, query: {}, body: null },
      EDITOR,
    )
    expect(response.status).toBe(409)
    const body = response.body as { error: { code: string } }
    expect(body.error.code).toBe('MEDIA_FOLDER_NOT_EMPTY')
  })
})

describe('POST /api/media/{id}/move', () => {
  it('files an asset into a folder, refusing an unknown destination', async () => {
    const asset = await store.create({
      kind: 'image',
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      size: 1,
      alt: 'a',
      storageKey: 'media/a.jpg',
    })

    const missing = await router.handle(
      {
        method: 'POST',
        path: `/api/media/${asset.id}/move`,
        query: {},
        body: { folderId: 'does-not-exist' },
      },
      EDITOR,
    )
    expect(missing.status).toBe(404)
    const missingBody = missing.body as { error: { code: string } }
    expect(missingBody.error.code).toBe('MEDIA_FOLDER_NOT_FOUND')

    const folder = await folders.create({ name: 'Photos' })
    const moved = await router.handle(
      {
        method: 'POST',
        path: `/api/media/${asset.id}/move`,
        query: {},
        body: { folderId: folder.id },
      },
      EDITOR,
    )
    expect(moved.status).toBe(200)
    const movedBody = moved.body as { data: { folderId: string | null } }
    expect(movedBody.data.folderId).toBe(folder.id)

    const cleared = await router.handle(
      {
        method: 'POST',
        path: `/api/media/${asset.id}/move`,
        query: {},
        body: { folderId: null },
      },
      EDITOR,
    )
    const clearedBody = cleared.body as { data: { folderId: string | null } }
    expect(clearedBody.data.folderId).toBeNull()
  })
})

describe('POST /api/media/-/bulk-move', () => {
  it('moves every id it can, reporting the rest', async () => {
    const folder = await folders.create({ name: 'Photos' })
    const a = await store.create({
      kind: 'image',
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      size: 1,
      alt: 'a',
      storageKey: 'media/a.jpg',
    })
    const b = await store.create({
      kind: 'image',
      filename: 'b.jpg',
      mimeType: 'image/jpeg',
      size: 1,
      alt: 'b',
      storageKey: 'media/b.jpg',
    })

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media/-/bulk-move',
        query: {},
        body: { ids: [a.id, b.id, 'does-not-exist'], folderId: folder.id },
      },
      EDITOR,
    )
    expect(response.status).toBe(200)
    const body = response.body as {
      data: { moved: { id: string }[]; failed: { id: string; code: string }[] }
    }
    expect(body.data.moved.map((m) => m.id).sort()).toEqual([a.id, b.id].sort())
    expect(body.data.failed).toEqual([
      { id: 'does-not-exist', code: 'MEDIA_NOT_FOUND', message: expect.any(String) },
    ])
  })
})

describe('GET /api/media?folderId=', () => {
  it('filters by folder, and "none" means unclassified', async () => {
    const folder = await folders.create({ name: 'Photos' })
    const filed = await store.create({
      kind: 'image',
      filename: 'filed.jpg',
      mimeType: 'image/jpeg',
      size: 1,
      alt: 'filed',
      storageKey: 'media/filed.jpg',
      folderId: folder.id,
    })
    const unfiled = await store.create({
      kind: 'image',
      filename: 'unfiled.jpg',
      mimeType: 'image/jpeg',
      size: 1,
      alt: 'unfiled',
      storageKey: 'media/unfiled.jpg',
    })

    const byFolder = await router.handle(
      { method: 'GET', path: '/api/media', query: { folderId: folder.id }, body: null },
      EDITOR,
    )
    const byFolderBody = byFolder.body as { data: { id: string }[] }
    expect(byFolderBody.data.map((i) => i.id)).toEqual([filed.id])

    const unclassified = await router.handle(
      { method: 'GET', path: '/api/media', query: { folderId: 'none' }, body: null },
      EDITOR,
    )
    const unclassifiedBody = unclassified.body as { data: { id: string }[] }
    expect(unclassifiedBody.data.map((i) => i.id)).toEqual([unfiled.id])
  })

  it('includeSubfolders resolves the whole subtree', async () => {
    const root = await folders.create({ name: 'Root' })
    const child = await folders.create({ name: 'Child', parentId: root.id })
    const inRoot = await store.create({
      kind: 'image',
      filename: 'root.jpg',
      mimeType: 'image/jpeg',
      size: 1,
      alt: 'root',
      storageKey: 'media/root.jpg',
      folderId: root.id,
    })
    const inChild = await store.create({
      kind: 'image',
      filename: 'child.jpg',
      mimeType: 'image/jpeg',
      size: 1,
      alt: 'child',
      storageKey: 'media/child.jpg',
      folderId: child.id,
    })

    const exactOnly = await router.handle(
      { method: 'GET', path: '/api/media', query: { folderId: root.id }, body: null },
      EDITOR,
    )
    const exactBody = exactOnly.body as { data: { id: string }[] }
    expect(exactBody.data.map((i) => i.id)).toEqual([inRoot.id])

    const withSubfolders = await router.handle(
      {
        method: 'GET',
        path: '/api/media',
        query: { folderId: root.id, includeSubfolders: '1' },
        body: null,
      },
      EDITOR,
    )
    const subfoldersBody = withSubfolders.body as { data: { id: string }[] }
    expect(new Set(subfoldersBody.data.map((i) => i.id))).toEqual(new Set([inRoot.id, inChild.id]))
  })
})
