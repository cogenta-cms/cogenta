import { describe, expect, it } from 'vitest'
import { isCogentaError } from '../../src/errors/index.js'
import type { MediaStore } from '../../src/media/index.js'

export interface MediaContractHarness {
  createStore(): Promise<MediaStore>
  dispose?(): Promise<void>
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return 'nothing was thrown'
  } catch (error) {
    return isCogentaError(error) ? error.code : `a plain ${String(error)}`
  }
}

/** The single contract suite for `MediaStore`, played against SQLite, Postgres and MySQL. */
export function runMediaContract(
  dialect: string,
  harness: () => Promise<MediaContractHarness>,
): void {
  describe(`MediaStore on ${dialect}`, () => {
    it('creates an asset with the given alt text', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const asset = await store.create({
          kind: 'image',
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          size: 1024,
          width: 800,
          height: 600,
          alt: 'A red bicycle leaning against a wall',
          storageKey: 'media/photo.jpg',
        })
        expect(asset.alt).toBe('A red bicycle leaning against a wall')
        expect(asset.decorative).toBe(false)
        expect(asset.width).toBe(800)
        expect(typeof asset.id).toBe('string')
      } finally {
        await dispose?.()
      }
    })

    it('refuses a non-decorative asset with empty alt text', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        expect(
          await codeOf(() =>
            store.create({
              kind: 'image',
              filename: 'photo.jpg',
              mimeType: 'image/jpeg',
              size: 1024,
              alt: '',
              storageKey: 'media/photo.jpg',
            }),
          ),
        ).toBe('MEDIA_INVALID')
      } finally {
        await dispose?.()
      }
    })

    it('refuses a decorative asset with no justification, and writes an empty alt when justified', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        expect(
          await codeOf(() =>
            store.create({
              kind: 'image',
              filename: 'divider.png',
              mimeType: 'image/png',
              size: 10,
              alt: '',
              decorative: true,
              storageKey: 'media/divider.png',
            }),
          ),
        ).toBe('MEDIA_INVALID')

        const asset = await store.create({
          kind: 'image',
          filename: 'divider.png',
          mimeType: 'image/png',
          size: 10,
          alt: 'would be ignored anyway',
          decorative: true,
          decorativeJustification: 'A purely visual section divider with no informational content.',
          storageKey: 'media/divider.png',
        })
        expect(asset.alt).toBe('')
        expect(asset.decorative).toBe(true)
        expect(asset.decorativeJustification).toBe(
          'A purely visual section divider with no informational content.',
        )
      } finally {
        await dispose?.()
      }
    })

    it('stores and reads back a focal point', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const asset = await store.create({
          kind: 'image',
          filename: 'portrait.jpg',
          mimeType: 'image/jpeg',
          size: 2048,
          alt: 'A portrait',
          focal: { x: 0.75, y: 0.2 },
          storageKey: 'media/portrait.jpg',
        })
        const found = await store.get(asset.id)
        expect(found?.focal).toEqual({ x: 0.75, y: 0.2 })
      } finally {
        await dispose?.()
      }
    })

    it('returns null for an id nothing was ever created under', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        expect(await store.get('does-not-exist')).toBeNull()
      } finally {
        await dispose?.()
      }
    })

    it('updates alt text, focal point and the decorative flag', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const asset = await store.create({
          kind: 'image',
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          size: 1024,
          alt: 'original alt',
          storageKey: 'media/photo.jpg',
        })

        const updated = await store.update(asset.id, {
          alt: 'updated alt',
          focal: { x: 0.5, y: 0.5 },
        })
        expect(updated.alt).toBe('updated alt')
        expect(updated.focal).toEqual({ x: 0.5, y: 0.5 })

        const madeDecorative = await store.update(asset.id, {
          decorative: true,
          decorativeJustification: 'Purely ornamental.',
        })
        expect(madeDecorative.alt).toBe('')
        expect(madeDecorative.decorative).toBe(true)
      } finally {
        await dispose?.()
      }
    })

    it('refuses to update an unknown id', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        expect(await codeOf(() => store.update('does-not-exist', { alt: 'x' }))).toBe(
          'MEDIA_NOT_FOUND',
        )
      } finally {
        await dispose?.()
      }
    })

    it('deletes an asset', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const asset = await store.create({
          kind: 'image',
          filename: 'gone.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'will be deleted',
          storageKey: 'media/gone.jpg',
        })
        await store.delete(asset.id)
        expect(await store.get(asset.id)).toBeNull()
      } finally {
        await dispose?.()
      }
    })

    it('lists everything by default and filters by kind', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const image = await store.create({
          kind: 'image',
          filename: 'a.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'an image',
          storageKey: 'media/a.jpg',
        })
        const file = await store.create({
          kind: 'file',
          filename: 'b.pdf',
          mimeType: 'application/pdf',
          size: 1,
          alt: 'a document',
          storageKey: 'media/b.pdf',
        })

        const all = await store.list()
        expect(new Set(all.items.map((item) => item.id))).toEqual(new Set([file.id, image.id]))

        const imagesOnly = await store.list({ kind: 'image' })
        expect(imagesOnly.items.map((item) => item.id)).toEqual([image.id])
      } finally {
        await dispose?.()
      }
    })

    it('paginates with an opaque cursor rather than an offset', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        for (let index = 0; index < 5; index += 1) {
          await store.create({
            kind: 'image',
            filename: `img-${index}.jpg`,
            mimeType: 'image/jpeg',
            size: 1,
            alt: `image ${index}`,
            storageKey: `media/img-${index}.jpg`,
          })
        }

        const first = await store.list({ limit: 2 })
        expect(first.items).toHaveLength(2)
        expect(first.hasMore).toBe(true)
        expect(first.nextCursor).not.toBeNull()

        const second = await store.list({
          limit: 2,
          ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
        })
        expect(second.items).toHaveLength(2)
        expect(second.items.map((item) => item.id)).not.toEqual(first.items.map((item) => item.id))

        const rest = await store.list({
          limit: 10,
          ...(second.nextCursor === null ? {} : { cursor: second.nextCursor }),
        })
        expect(rest.hasMore).toBe(false)
        expect(rest.nextCursor).toBeNull()
      } finally {
        await dispose?.()
      }
    })
  })
}
