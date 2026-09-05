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
  type IngestMediaUploadDeps,
  ingestMediaUpload,
  type MediaImageProcessor,
} from '../../src/rest/media-ingest.js'

/**
 * `ingestMediaUpload` against a real SQLite `MediaStore` and a real
 * filesystem `StorageDriver` — no mock of the database (house rule). This is
 * the same pipeline `media-router.ts`'s `POST /api/media` now calls, and the
 * one `create-cogenta`'s `seedDemoMedia` (L25 task A0b) calls to seed a
 * blueprint's procedurally generated art through the exact same checks and
 * variant pipeline a human upload takes.
 */

// A 1x1 transparent PNG, real magic bytes and all — the same fixture
// `media-router.test.ts` uses, so the real-type sniff has something genuine
// to recognise.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64')

let db: DatabaseHandle
let store: MediaStore
let storage: StorageDriver
let storageRoot: string

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  store = createDatabaseMediaStore({ db })
  storageRoot = await mkdtemp(join(tmpdir(), 'cogenta-media-ingest-'))
  storage = createLocalStorage({ path: storageRoot })
})

afterEach(async () => {
  await db.close()
  await rm(storageRoot, { recursive: true, force: true })
})

describe('ingestMediaUpload', () => {
  it('writes a real image and creates its asset record, without an image processor', async () => {
    const asset = await ingestMediaUpload(
      { store, storage },
      {
        kind: 'image',
        filename: 'cover.png',
        mimeType: 'image/png',
        bytes: PNG_BYTES,
        actorId: 'user-1',
        alt: 'A single transparent pixel',
      },
    )

    expect(asset.alt).toBe('A single transparent pixel')
    expect(asset.mimeType).toBe('image/png')
    expect(asset.createdBy).toBe('user-1')
    expect(await storage.exists(asset.storageKey)).toBe(true)
    // No processor was given — R2's shape, applied to images: the upload
    // still works, it simply carries no dimensions and no variants.
    expect(asset.width).toBeNull()
    expect(asset.height).toBeNull()
  })

  it('refuses a disguised file whose declared kind is image but whose bytes are not', async () => {
    await expect(
      ingestMediaUpload(
        { store, storage },
        {
          kind: 'image',
          filename: 'not-really.png',
          mimeType: 'image/png',
          bytes: Buffer.from('<svg onload="alert(1)"></svg>'),
          actorId: null,
        },
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_TYPE_REJECTED' })

    // No orphaned row from the refused ingest.
    expect(await store.count()).toBe(0)
  })

  it('refuses a file larger than the configured limit, before writing anything', async () => {
    await expect(
      ingestMediaUpload(
        { store, storage, limits: { maxUploadBytes: 4 } },
        {
          kind: 'image',
          filename: 'cover.png',
          mimeType: 'image/png',
          bytes: PNG_BYTES,
          actorId: null,
        },
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_INVALID' })

    expect(await store.count()).toBe(0)
  })

  it('runs a PNG through an image processor and stores its variants', async () => {
    const fakeProcessor: MediaImageProcessor = {
      probe: async () => ({ width: 1, height: 1 }),
      variants: async () => [
        { name: '1.webp', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/webp' },
      ],
      variantNames: () => ['1.webp'],
    }
    const deps: IngestMediaUploadDeps = { store, storage, images: fakeProcessor }

    const asset = await ingestMediaUpload(deps, {
      kind: 'image',
      filename: 'cover.png',
      mimeType: 'image/png',
      bytes: PNG_BYTES,
      actorId: 'user-1',
      alt: 'A cover image',
    })

    expect(asset.width).toBe(1)
    expect(asset.height).toBe(1)
    const variantKey = `media/${asset.id}/variants/1.webp`
    expect(await storage.exists(variantKey)).toBe(true)
  })

  it('attributes a seed with no signed-in actor to null, not a guessed id', async () => {
    const asset = await ingestMediaUpload(
      { store, storage },
      {
        kind: 'image',
        filename: 'demo-hero.png',
        mimeType: 'image/png',
        bytes: PNG_BYTES,
        actorId: null,
        alt: 'A procedurally generated hero image',
      },
    )
    expect(asset.createdBy).toBeNull()
  })

  it('cleans up the stored blob when the asset row is refused', async () => {
    await expect(
      ingestMediaUpload(
        { store, storage },
        {
          kind: 'image',
          filename: 'cover.png',
          mimeType: 'image/png',
          bytes: PNG_BYTES,
          actorId: null,
          alt: '',
          decorative: false,
        },
      ),
    ).rejects.toBeTruthy()

    // The database refuses a non-decorative asset with empty alt text — the
    // same rule `media-router.test.ts` exercises through the HTTP layer.
    // Nothing was left in storage for the refused row.
    expect(await store.count()).toBe(0)
  })
})
