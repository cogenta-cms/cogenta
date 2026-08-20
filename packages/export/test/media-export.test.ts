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
import { exportMediaArchive, exportMediaReferences } from '../src/media-export.js'
import { openZip } from '../src/zip-reader.js'

describe('exportMediaReferences / exportMediaArchive', () => {
  let directory: string
  let db: DatabaseHandle
  let storage: StorageDriver
  let media: MediaStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-media-export-'))
    db = await createSqliteHandle({ url: join(directory, 'site.db') })
    storage = createLocalStorage({ path: join(directory, 'storage') })
    media = createDatabaseMediaStore({ db })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('references mode lists storage keys without touching the bytes', async () => {
    await storage.put('media/cover.png', Buffer.from('not really a png'))
    const asset = await media.create({
      kind: 'image',
      filename: 'cover.png',
      mimeType: 'image/png',
      size: 17,
      alt: 'A cover image',
      storageKey: 'media/cover.png',
    })

    const lines: string[] = []
    for await (const line of exportMediaReferences({ media, ids: [asset.id] })) lines.push(line)

    expect(lines).toHaveLength(1)
    const record = JSON.parse((lines[0] ?? '').trim())
    expect(record).toMatchObject({
      kind: 'media-ref',
      id: asset.id,
      filename: 'cover.png',
      storageKey: 'media/cover.png',
    })
  })

  it('archive mode streams the real bytes into a ZIP, never assembling the archive in memory first', async () => {
    const bytes = Buffer.from('the real image bytes, however many there are')
    await storage.put('media/photo.jpg', bytes)
    const asset = await media.create({
      kind: 'image',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: bytes.length,
      alt: 'A photo',
      storageKey: 'media/photo.jpg',
    })

    const chunks: Buffer[] = []
    let sawIntermediateChunks = 0
    await exportMediaArchive({
      media,
      storage,
      ids: [asset.id],
      write: (chunk) => {
        sawIntermediateChunks += 1
        chunks.push(chunk)
      },
    })
    // The writer emits a local header, then the body, then a data
    // descriptor — always more than one `write` call, even for a single
    // small file. A single call would mean the whole entry was buffered
    // and handed over as one blob instead of streamed.
    expect(sawIntermediateChunks).toBeGreaterThan(1)

    const archivePath = join(directory, 'media.zip')
    await import('node:fs/promises').then((fs) => fs.writeFile(archivePath, Buffer.concat(chunks)))

    const zip = await openZip(archivePath)
    expect(zip.entries.map((entry) => entry.name)).toEqual([
      `media/${asset.id}/photo.jpg`,
      'manifest.json',
    ])

    const readAll = async (name: string): Promise<Buffer> => {
      const parts: Buffer[] = []
      for await (const chunk of zip.read(name)) parts.push(chunk)
      return Buffer.concat(parts)
    }

    expect((await readAll(`media/${asset.id}/photo.jpg`)).toString('utf8')).toBe(
      bytes.toString('utf8'),
    )
    const manifest = JSON.parse((await readAll('manifest.json')).toString('utf8'))
    expect(manifest).toEqual([
      {
        kind: 'media-ref',
        id: asset.id,
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: bytes.length,
        storageKey: 'media/photo.jpg',
      },
    ])
    await zip.close()
  })

  it('refuses when a referenced medium no longer exists', async () => {
    await expect(
      exportMediaArchive({ media, storage, ids: ['missing-id'], write: () => undefined }),
    ).rejects.toMatchObject({ code: 'EXPORT_MEDIA_NOT_FOUND' })
  })
})
