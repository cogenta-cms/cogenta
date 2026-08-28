import { describe, expect, it } from 'vitest'
import { isCogentaError } from '../../src/errors/index.js'
import type { MediaFolderStore, MediaStore } from '../../src/media/index.js'

export interface MediaFolderContractHarness {
  createFolderStore(): Promise<MediaFolderStore>
  /** Backed by the same database as `createFolderStore` — needed for the "still holds assets" delete guard. */
  createMediaStore(): Promise<MediaStore>
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

/** The single contract suite for `MediaFolderStore`, played against SQLite, Postgres and MySQL. */
export function runMediaFolderContract(
  dialect: string,
  harness: () => Promise<MediaFolderContractHarness>,
): void {
  describe(`MediaFolderStore on ${dialect}`, () => {
    it('creates a root folder', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const folder = await folders.create({ name: 'Contents' })
        expect(folder.parentId).toBeNull()
        expect(folder.name).toBe('Contents')
        expect(folder.path).toBe(`/${folder.id}/`)
      } finally {
        await dispose?.()
      }
    })

    it('refuses a folder with an empty (or whitespace-only) name', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        expect(await codeOf(() => folders.create({ name: '' }))).toBe('MEDIA_FOLDER_INVALID')
        expect(await codeOf(() => folders.create({ name: '   ' }))).toBe('MEDIA_FOLDER_INVALID')
      } finally {
        await dispose?.()
      }
    })

    it('nests a subfolder, extending the parent path by one segment', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const parent = await folders.create({ name: 'Contents' })
        const child = await folders.create({ name: 'Blog', parentId: parent.id })
        expect(child.parentId).toBe(parent.id)
        expect(child.path).toBe(`${parent.path}${child.id}/`)
      } finally {
        await dispose?.()
      }
    })

    it('refuses two siblings sharing a name, case- and whitespace-insensitively', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        await folders.create({ name: 'Contents' })
        expect(await codeOf(() => folders.create({ name: '  contents ' }))).toBe(
          'MEDIA_FOLDER_NAME_TAKEN',
        )
      } finally {
        await dispose?.()
      }
    })

    it('allows the same name under two different parents', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const a = await folders.create({ name: 'A' })
        const b = await folders.create({ name: 'B' })
        const underA = await folders.create({ name: 'Photos', parentId: a.id })
        const underB = await folders.create({ name: 'Photos', parentId: b.id })
        expect(underA.id).not.toBe(underB.id)
      } finally {
        await dispose?.()
      }
    })

    it('renames a folder, and refuses a rename that collides with a sibling', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const one = await folders.create({ name: 'One' })
        await folders.create({ name: 'Two' })
        const renamed = await folders.update(one.id, { name: 'Renamed' })
        expect(renamed.name).toBe('Renamed')
        expect(await codeOf(() => folders.update(one.id, { name: 'Two' }))).toBe(
          'MEDIA_FOLDER_NAME_TAKEN',
        )
      } finally {
        await dispose?.()
      }
    })

    it('moves a subtree, rewriting every descendant path', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const root = await folders.create({ name: 'Root' })
        const other = await folders.create({ name: 'Other' })
        const branch = await folders.create({ name: 'Branch', parentId: root.id })
        const leaf = await folders.create({ name: 'Leaf', parentId: branch.id })

        const movedBranch = await folders.move(branch.id, other.id)
        expect(movedBranch.parentId).toBe(other.id)
        expect(movedBranch.path).toBe(`${other.path}${branch.id}/`)

        const movedLeaf = await folders.read(leaf.id)
        expect(movedLeaf?.path).toBe(`${movedBranch.path}${leaf.id}/`)
      } finally {
        await dispose?.()
      }
    })

    it('refuses moving a folder into its own subtree', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const root = await folders.create({ name: 'Root' })
        const child = await folders.create({ name: 'Child', parentId: root.id })
        expect(await codeOf(() => folders.move(root.id, child.id))).toBe('MEDIA_FOLDER_CYCLE')
      } finally {
        await dispose?.()
      }
    })

    it('refuses moving a folder into itself', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const root = await folders.create({ name: 'Root' })
        expect(await codeOf(() => folders.move(root.id, root.id))).toBe('MEDIA_FOLDER_CYCLE')
      } finally {
        await dispose?.()
      }
    })

    it('refuses deleting a folder that still has subfolders', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const root = await folders.create({ name: 'Root' })
        await folders.create({ name: 'Child', parentId: root.id })
        expect(await codeOf(() => folders.delete(root.id))).toBe('MEDIA_FOLDER_NOT_EMPTY')
      } finally {
        await dispose?.()
      }
    })

    it('refuses deleting a folder that still holds media assets', async () => {
      const { createFolderStore, createMediaStore, dispose } = await harness()
      const folders = await createFolderStore()
      const media = await createMediaStore()
      try {
        const folder = await folders.create({ name: 'Photos' })
        await media.create({
          kind: 'image',
          filename: 'a.jpg',
          mimeType: 'image/jpeg',
          size: 1,
          alt: 'a',
          storageKey: 'media/a.jpg',
          folderId: folder.id,
        })
        expect(await codeOf(() => folders.delete(folder.id))).toBe('MEDIA_FOLDER_NOT_EMPTY')
      } finally {
        await dispose?.()
      }
    })

    it('deletes an empty folder', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const folder = await folders.create({ name: 'Temp' })
        expect(await folders.delete(folder.id)).toBe(true)
        expect(await folders.read(folder.id)).toBeNull()
      } finally {
        await dispose?.()
      }
    })

    it('lists direct children ordered by position, and the whole tree depth-first otherwise', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const root = await folders.create({ name: 'Root' })
        const second = await folders.create({ name: 'Second', parentId: root.id })
        const first = await folders.create({
          name: 'First',
          parentId: root.id,
          position: 0,
        })
        await folders.update(second.id, { position: 1 })

        const children = await folders.list({ parentId: root.id })
        expect(children.map((f) => f.id)).toEqual([first.id, second.id])

        const whole = await folders.list()
        expect(whole[0]?.id).toBe(root.id)
        expect(whole.map((f) => f.id)).toEqual(
          expect.arrayContaining([root.id, first.id, second.id]),
        )
      } finally {
        await dispose?.()
      }
    })

    it('answers a folder id plus every descendant id for subtreeIds', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const root = await folders.create({ name: 'Root' })
        const child = await folders.create({ name: 'Child', parentId: root.id })
        const grandchild = await folders.create({ name: 'Grandchild', parentId: child.id })
        const unrelated = await folders.create({ name: 'Unrelated' })

        const ids = await folders.subtreeIds(root.id)
        expect(new Set(ids)).toEqual(new Set([root.id, child.id, grandchild.id]))
        expect(ids).not.toContain(unrelated.id)
      } finally {
        await dispose?.()
      }
    })

    it('refuses nesting a folder deeper than the maximum depth', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        let parentId: string | null = null
        // MAX_MEDIA_FOLDER_DEPTH is 12 (root = depth 0); the 13th level down
        // must be refused.
        for (let depth = 0; depth < 12; depth += 1) {
          const created = await folders.create({ name: `Level ${depth}`, parentId })
          parentId = created.id
        }
        expect(await codeOf(() => folders.create({ name: 'Too deep', parentId }))).toBe(
          'MEDIA_FOLDER_TOO_DEEP',
        )
      } finally {
        await dispose?.()
      }
    })

    it('ensureRoot is idempotent: calling it twice returns the same folder', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const first = await folders.ensureRoot('contents')
        const second = await folders.ensureRoot('contents')
        expect(second.id).toBe(first.id)
        expect((await folders.list({ parentId: null })).length).toBe(1)
      } finally {
        await dispose?.()
      }
    })

    it('lets a sibling be created next to the ensureRoot folder', async () => {
      const { createFolderStore, dispose } = await harness()
      const folders = await createFolderStore()
      try {
        const contents = await folders.ensureRoot('contents')
        const sibling = await folders.create({ name: 'Archive' })
        expect(sibling.parentId).toBeNull()
        expect(sibling.id).not.toBe(contents.id)
      } finally {
        await dispose?.()
      }
    })
  })
}
