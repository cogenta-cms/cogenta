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

    it('stores tags and filters by one of them', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const tagged = await store.create({
          kind: 'image',
          filename: 'hero.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'A hero image',
          storageKey: 'media/hero.jpg',
          tags: ['homepage', 'campaign-2026'],
        })
        const untagged = await store.create({
          kind: 'image',
          filename: 'other.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'Something else',
          storageKey: 'media/other.jpg',
        })

        expect((await store.get(tagged.id))?.tags).toEqual(['homepage', 'campaign-2026'])
        expect((await store.get(untagged.id))?.tags).toEqual([])

        const filtered = await store.list({ tag: 'homepage' })
        expect(filtered.items.map((item) => item.id)).toEqual([tagged.id])

        // A tag that merely contains the filter as a substring is not a match —
        // `homepage` must not also return an asset tagged `homepage-archive`.
        const decoy = await store.create({
          kind: 'image',
          filename: 'decoy.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'A decoy',
          storageKey: 'media/decoy.jpg',
          tags: ['homepage-archive'],
        })
        const stillOneMatch = await store.list({ tag: 'homepage' })
        expect(stillOneMatch.items.map((item) => item.id)).toEqual([tagged.id])
        expect(stillOneMatch.items.map((item) => item.id)).not.toContain(decoy.id)

        const replaced = await store.update(tagged.id, { tags: ['rebrand'] })
        expect(replaced.tags).toEqual(['rebrand'])
        expect((await store.list({ tag: 'homepage' })).items).toHaveLength(0)
      } finally {
        await dispose?.()
      }
    })

    it('gives every asset a stable, non-empty content hash', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const asset = await store.create({
          kind: 'image',
          filename: 'a.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'a',
          storageKey: 'media/a.jpg',
        })
        expect(asset.contentHash.length).toBeGreaterThan(0)
        expect((await store.get(asset.id))?.contentHash).toBe(asset.contentHash)
      } finally {
        await dispose?.()
      }
    })

    it('replace() overwrites the file facts, keeps the id, and changes the content hash', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const asset = await store.create({
          kind: 'image',
          filename: 'logo.png',
          mimeType: 'image/png',
          size: 100,
          width: 200,
          height: 200,
          alt: 'Company logo',
          storageKey: 'media/logo/original',
          contentHash: 'hash-v1',
        })

        const replaced = await store.replace(asset.id, {
          mimeType: 'image/webp',
          size: 240,
          width: 400,
          height: 400,
          storageKey: 'media/logo/v2',
          contentHash: 'hash-v2',
        })

        expect(replaced.id).toBe(asset.id)
        expect(replaced.mimeType).toBe('image/webp')
        expect(replaced.size).toBe(240)
        expect(replaced.width).toBe(400)
        expect(replaced.storageKey).toBe('media/logo/v2')
        expect(replaced.contentHash).toBe('hash-v2')
        // Untouched by a replace: this is still the same subject.
        expect(replaced.alt).toBe('Company logo')
        expect(replaced.filename).toBe('logo.png')

        const reread = await store.get(asset.id)
        expect(reread?.contentHash).toBe('hash-v2')
      } finally {
        await dispose?.()
      }
    })

    it('refuses to replace an unknown id', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        expect(
          await codeOf(() =>
            store.replace('does-not-exist', {
              mimeType: 'image/png',
              size: 1,
              storageKey: 'media/x',
              contentHash: 'x',
            }),
          ),
        ).toBe('MEDIA_NOT_FOUND')
      } finally {
        await dispose?.()
      }
    })

    it('counts matching assets independently of limit and cursor', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        for (let index = 0; index < 5; index += 1) {
          await store.create({
            kind: index % 2 === 0 ? 'image' : 'file',
            filename: `f-${index}`,
            mimeType: 'application/octet-stream',
            size: 1,
            alt: `asset ${index}`,
            storageKey: `media/f-${index}`,
          })
        }

        expect(await store.count()).toBe(5)
        expect(await store.count({ kind: 'image' })).toBe(3)
      } finally {
        await dispose?.()
      }
    })

    it('sorts by filename and by size, ascending or descending', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const banana = await store.create({
          kind: 'image',
          filename: 'banana.jpg',
          mimeType: 'image/jpeg',
          size: 300,
          alt: 'banana',
          storageKey: 'media/banana.jpg',
        })
        const apple = await store.create({
          kind: 'image',
          filename: 'apple.jpg',
          mimeType: 'image/jpeg',
          size: 100,
          alt: 'apple',
          storageKey: 'media/apple.jpg',
        })
        const cherry = await store.create({
          kind: 'image',
          filename: 'cherry.jpg',
          mimeType: 'image/jpeg',
          size: 200,
          alt: 'cherry',
          storageKey: 'media/cherry.jpg',
        })

        const byName = await store.list({ sort: 'filename', direction: 'asc' })
        expect(byName.items.map((item) => item.id)).toEqual([apple.id, banana.id, cherry.id])

        const bySizeDesc = await store.list({ sort: 'size', direction: 'desc' })
        expect(bySizeDesc.items.map((item) => item.id)).toEqual([banana.id, cherry.id, apple.id])

        const firstPage = await store.list({ sort: 'size', direction: 'asc', limit: 2 })
        expect(firstPage.items.map((item) => item.id)).toEqual([apple.id, cherry.id])
        expect(firstPage.hasMore).toBe(true)
        const secondPage = await store.list({
          sort: 'size',
          direction: 'asc',
          limit: 2,
          ...(firstPage.nextCursor === null ? {} : { cursor: firstPage.nextCursor }),
        })
        expect(secondPage.items.map((item) => item.id)).toEqual([banana.id])
      } finally {
        await dispose?.()
      }
    })

    it('filters by a created-at date range', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const asset = await store.create({
          kind: 'image',
          filename: 'dated.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'dated',
          storageKey: 'media/dated.jpg',
        })
        const created = await store.get(asset.id)
        const createdAt = created?.createdAt ?? new Date().toISOString()

        const past = new Date(Date.parse(createdAt) - 60_000).toISOString()
        const future = new Date(Date.parse(createdAt) + 60_000).toISOString()

        expect(
          (await store.list({ from: past, to: future })).items.map((item) => item.id),
        ).toContain(asset.id)
        expect((await store.list({ from: future })).items.map((item) => item.id)).not.toContain(
          asset.id,
        )
        expect((await store.list({ to: past })).items.map((item) => item.id)).not.toContain(
          asset.id,
        )
      } finally {
        await dispose?.()
      }
    })

    it('files an asset in a folder, and treats an absent folderId as unclassified (fiche 46)', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const filed = await store.create({
          kind: 'image',
          filename: 'filed.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'filed',
          storageKey: 'media/filed.jpg',
          folderId: 'folder-a',
        })
        const unfiled = await store.create({
          kind: 'image',
          filename: 'unfiled.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'unfiled',
          storageKey: 'media/unfiled.jpg',
        })

        expect(filed.folderId).toBe('folder-a')
        expect(unfiled.folderId).toBeNull()

        expect((await store.list({ folderId: 'folder-a' })).items.map((i) => i.id)).toEqual([
          filed.id,
        ])
        expect((await store.list({ folderId: null })).items.map((i) => i.id)).toContain(unfiled.id)
        expect((await store.list({ folderId: null })).items.map((i) => i.id)).not.toContain(
          filed.id,
        )
      } finally {
        await dispose?.()
      }
    })

    it('moves an asset between folders via update(), and matches a resolved folderIds set', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const asset = await store.create({
          kind: 'image',
          filename: 'movable.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'movable',
          storageKey: 'media/movable.jpg',
          folderId: 'folder-a',
        })

        const moved = await store.update(asset.id, { folderId: 'folder-b' })
        expect(moved.folderId).toBe('folder-b')

        // `folderIds` is how `?includeSubfolders=1` is implemented at the
        // REST layer: the router resolves a subtree to a set of ids first,
        // then asks for anything matching any of them.
        expect(
          (await store.list({ folderIds: ['folder-b', 'folder-c'] })).items.map((i) => i.id),
        ).toEqual([moved.id])
        expect((await store.list({ folderIds: ['folder-c'] })).items).toHaveLength(0)

        const clearedToRoot = await store.update(asset.id, { folderId: null })
        expect(clearedToRoot.folderId).toBeNull()
      } finally {
        await dispose?.()
      }
    })
  })
}
