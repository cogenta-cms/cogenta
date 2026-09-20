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
  createMediaRouter,
  type ImageSize,
  type MediaImageProcessor,
  type MediaRouter,
  variantKeyFor,
} from '../../src/rest/media-router.js'

/**
 * The upload-time image pipeline (L10 task 5), from this package's side.
 *
 * The database and the storage are real (AGENTS.md: never a mock). The
 * *processor* is a stand-in on purpose: it is an injected interface, not
 * infrastructure, and this package deliberately does not depend on
 * `@cogenta/render` — the real encoder is exercised end to end in
 * `packages/cli/test/serve-images.test.ts`, against real bytes. What is
 * proved here is the contract the router holds up around it.
 */

const EDITOR = { id: 'user-1', roles: ['editor'] }

/** A 1x1 transparent PNG — real magic bytes, which is what the type check reads. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const NAMES = ['320.webp', '640.webp']

function processorThat(
  behaviour: {
    readonly probe?: () => Promise<ImageSize | null>
    readonly variants?: () => Promise<never>
    /** Present makes the router able to crop and rotate (L39). */
    readonly edit?: boolean
  } = {},
): MediaImageProcessor {
  return {
    ...(behaviour.edit === true
      ? {
          edit: async () => ({ bytes: new Uint8Array([9, 9, 9]), contentType: 'image/webp' }),
        }
      : {}),
    probe: behaviour.probe ?? (async () => ({ width: 1000, height: 500 })),
    variants:
      behaviour.variants ??
      (async () =>
        NAMES.map((name, index) => ({
          name,
          bytes: new Uint8Array([index, index, index]),
          contentType: 'image/webp',
        }))),
    variantNames: () => NAMES,
  }
}

let db: DatabaseHandle
let store: MediaStore
let storage: StorageDriver
let storageRoot: string

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  store = createDatabaseMediaStore({ db })
  storageRoot = await mkdtemp(join(tmpdir(), 'cogenta-media-images-'))
  storage = createLocalStorage({ path: storageRoot })
})

afterEach(async () => {
  await db.close()
  await rm(storageRoot, { recursive: true, force: true })
})

async function upload(
  router: MediaRouter,
  kind: 'image' | 'file' = 'image',
): Promise<{ readonly id: string; readonly width: number | null; readonly height: number | null }> {
  const response = await router.handle(
    {
      method: 'POST',
      path: '/api/media',
      query: {},
      body: {
        kind,
        filename: 'a.png',
        mimeType: kind === 'image' ? 'image/png' : 'application/octet-stream',
        data: PNG_BASE64,
        alt: 'x',
      },
    },
    EDITOR,
  )
  if (response.status !== 201) throw new Error(`upload failed: ${response.status}`)
  return (response.body as { data: { id: string; width: number | null; height: number | null } })
    .data
}

describe('media upload with an image processor', () => {
  it('records the probed dimensions and writes every variant beside the original', async () => {
    const router = createMediaRouter({ store, storage, images: processorThat() })
    const asset = await upload(router)

    expect(asset.width).toBe(1000)
    expect(asset.height).toBe(500)
    for (const name of NAMES) {
      expect(await storage.exists(variantKeyFor(asset.id, name))).toBe(true)
    }
  })

  it('leaves a non-image alone', async () => {
    const router = createMediaRouter({ store, storage, images: processorThat() })
    const asset = await upload(router, 'file')

    expect(asset.width).toBeNull()
    for (const name of NAMES) {
      expect(await storage.exists(variantKeyFor(asset.id, name))).toBe(false)
    }
  })

  it('still accepts the upload when the processor cannot read the image at all', async () => {
    const router = createMediaRouter({
      store,
      storage,
      images: processorThat({ probe: async () => null }),
    })
    const asset = await upload(router)

    // No dimensions, no variants — and a perfectly usable asset. The original
    // is what the editor uploaded; a pipeline failure must not lose it.
    expect(asset.width).toBeNull()
    expect(await storage.exists(variantKeyFor(asset.id, '320.webp'))).toBe(false)
    const read = await store.get(asset.id)
    expect(read).not.toBeNull()
    expect(await storage.exists(read?.storageKey ?? '')).toBe(true)
  })

  it('leaves no half-written variants behind when the encoder throws', async () => {
    const router = createMediaRouter({
      store,
      storage,
      images: processorThat({
        variants: async () => {
          throw new Error('encoder exploded')
        },
      }),
    })
    const asset = await upload(router)

    expect(await store.get(asset.id)).not.toBeNull()
    for (const name of NAMES) {
      expect(await storage.exists(variantKeyFor(asset.id, name))).toBe(false)
    }
  })

  it('deletes the variants with the asset', async () => {
    const router = createMediaRouter({ store, storage, images: processorThat() })
    const asset = await upload(router)
    expect(await storage.exists(variantKeyFor(asset.id, '320.webp'))).toBe(true)

    const response = await router.handle(
      { method: 'DELETE', path: `/api/media/${asset.id}`, query: {} },
      EDITOR,
    )
    expect(response.status).toBe(204)
    for (const name of NAMES) {
      expect(await storage.exists(variantKeyFor(asset.id, name))).toBe(false)
    }
  })

  it('uploads exactly as before when no processor is configured', async () => {
    const router = createMediaRouter({ store, storage })
    const asset = await upload(router)

    expect(asset.width).toBeNull()
    expect(await storage.exists(variantKeyFor(asset.id, '320.webp'))).toBe(false)
  })
})

describe('the media library is not a public catalogue', () => {
  it('refuses an anonymous list and an anonymous read', async () => {
    const router = createMediaRouter({ store, storage, images: processorThat() })
    const asset = await upload(router)

    // The ids listed here are exactly what a public delivery endpoint like
    // `/_image` is keyed on: an open list turns an unguessable URL into an
    // enumerable one, and the storage key in the payload names the blob
    // directly.
    const listed = await router.handle(
      { method: 'GET', path: '/api/media', query: {} },
      { id: null, roles: ['public'] },
    )
    expect(listed.status).toBe(401)

    const read = await router.handle(
      { method: 'GET', path: `/api/media/${asset.id}`, query: {} },
      { id: null, roles: ['public'] },
    )
    expect(read.status).toBe(401)

    // Signed in, both still work.
    expect(
      (await router.handle({ method: 'GET', path: '/api/media', query: {} }, EDITOR)).status,
    ).toBe(200)
  })
})

describe('an uploaded image is stored with the type its bytes earn', () => {
  it('ignores a declared content type that would execute on the site origin', async () => {
    const router = createMediaRouter({ store, storage, images: processorThat() })

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'image',
          filename: 'a.png',
          // A genuine PNG announced as a document. Sniffing accepts the bytes
          // — they really are a PNG — and the declared type used to travel
          // straight back out as the `Content-Type` of a public, cacheable
          // response on the site's own origin.
          mimeType: 'text/html',
          data: PNG_BASE64,
          alt: 'x',
        },
      },
      EDITOR,
    )

    expect(response.status).toBe(201)
    const asset = (response.body as { data: { id: string; mimeType: string } }).data
    expect(asset.mimeType).toBe('image/png')
    expect((await store.get(asset.id))?.mimeType).toBe('image/png')
  })

  /**
   * Editing is non-destructive: the server re-derives every edit from the
   * untouched original rather than stacking it on the last result, which is
   * what stops quality compounding away. The editor therefore opens on the
   * original — and, with no way to learn what is currently applied, on a
   * default frame too, so an applied crop looked undone and was silently
   * replaced by whatever was applied next. The parameters were stored the
   * whole time and read only inside this router.
   */
  it('hands back the crop and rotation currently applied, so an editor can open on them', async () => {
    const router = createMediaRouter({ store, storage, images: processorThat({ edit: true }) })
    const { id } = await upload(router)
    const read = async (): Promise<{ edited?: boolean; lastEdit?: unknown }> =>
      (
        (await router.handle({ method: 'GET', path: `/api/media/${id}`, query: {} }, EDITOR))
          .body as { data: { edited?: boolean; lastEdit?: unknown } }
      ).data

    expect((await read()).lastEdit).toBeUndefined()

    const edit = { rotate: 90, crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } }
    const edited = await router.handle(
      { method: 'POST', path: `/api/media/${id}/edit`, query: {}, body: edit },
      EDITOR,
    )
    expect(edited.status).toBe(200)

    const after = await read()
    expect(after.edited).toBe(true)
    expect(after.lastEdit).toMatchObject(edit)
  })

  /**
   * An image's stored type is the one its bytes earn, never the declared one
   * (L10's security review). Every other kind was stored exactly as
   * declared, so a `kind: 'file'` upload could carry `text/html` — bytes
   * with a `<script>` in them, handed back from the site's own origin with
   * that very type. A bearer token is what stops that being exploitable
   * today: a browser navigation gets 401 and `/_image` refuses a non-image.
   * The layer beneath was missing, and a token is a thin thing to rest on.
   */
  it('refuses to store a content type that would execute, whatever the kind says', async () => {
    const router = createMediaRouter({ store, storage, images: processorThat() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'file',
          filename: 'evil.html',
          mimeType: 'text/html',
          data: Buffer.from('<html><script>alert(1)</script></html>').toString('base64'),
          alt: 'x',
        },
      },
      EDITOR,
    )

    expect(response.status).toBe(201)
    // Stored, but never as something a browser would run.
    expect((response.body as { data: { mimeType: string } }).data.mimeType).toBe(
      'application/octet-stream',
    )
  })

  it('keeps an ordinary document type exactly as declared', async () => {
    const router = createMediaRouter({ store, storage, images: processorThat() })
    for (const mimeType of ['text/plain', 'application/pdf', 'text/csv']) {
      const response = await router.handle(
        {
          method: 'POST',
          path: '/api/media',
          query: {},
          body: {
            kind: 'file',
            filename: 'notes',
            mimeType,
            data: Buffer.from('plain enough').toString('base64'),
            alt: 'x',
          },
        },
        EDITOR,
      )
      expect((response.body as { data: { mimeType: string } }).data.mimeType).toBe(mimeType)
    }
  })

  it('leaves a non-image kind declared as sent, since it is never served publicly', async () => {
    const router = createMediaRouter({ store, storage })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/media',
        query: {},
        body: {
          kind: 'file',
          filename: 'notes.txt',
          mimeType: 'text/plain',
          data: Buffer.from('hello').toString('base64'),
          alt: 'x',
        },
      },
      EDITOR,
    )
    expect((response.body as { data: { mimeType: string } }).data.mimeType).toBe('text/plain')
  })
})
