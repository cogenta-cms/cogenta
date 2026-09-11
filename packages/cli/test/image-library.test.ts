import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDatabaseMediaStore,
  createLocalStorage,
  createSqliteHandle,
  type DatabaseHandle,
} from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createImageLibrary } from '../src/commands/image-library.js'

/**
 * The step that turns a generated candidate into a real file.
 *
 * `assist.generate_image` stores nothing on purpose, so until this existed an
 * image a model produced could be looked at and never kept. Everything that
 * lands here is recorded as `generated` with the agent and model that made
 * it — the alternative is a picture nobody can tell apart from a photograph
 * the owner took, which is the claim contract A made provenance non-optional
 * to prevent.
 *
 * Real SQLite, real local storage driver, real bytes.
 */

const dirs: string[] = []
const handles: DatabaseHandle[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map((db) => db.close()))
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/** A real 1×1 PNG, base64 — small, but genuinely decodable bytes. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function library() {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-image-library-'))
  dirs.push(root)
  const db = await createSqliteHandle({ url: ':memory:' })
  handles.push(db)
  const mediaStore = createDatabaseMediaStore({ db })
  const storage = createLocalStorage({ path: join(root, 'uploads') })
  return { save: createImageLibrary({ mediaStore, storage }), mediaStore, storage }
}

const DETAIL = { agent: 'image-creator', model: 'test-image-model', at: '2026-09-11T09:00:00.000Z' }

describe('keeping a generated image', () => {
  it('writes the real bytes and records what made them', async () => {
    const { save, mediaStore, storage } = await library()

    const stored = await save({
      dataUrl: `data:image/png;base64,${PNG_BASE64}`,
      filename: 'Hero — bakery at dawn!',
      alt: 'A baker sliding a tray of baguettes into a wood oven',
      provenanceDetail: DETAIL,
    })

    expect(stored.byteLength).toBeGreaterThan(0)
    // The operator's name survives, minus everything a path could not.
    expect(stored.filename).toBe('hero-bakery-at-dawn.png')

    const asset = await mediaStore.get(stored.id)
    expect(asset).not.toBeNull()
    if (asset === null) return
    expect(asset.kind).toBe('image')
    expect(asset.alt).toBe('A baker sliding a tray of baguettes into a wood oven')
    expect(asset.provenance).toBe('generated')
    expect(asset.provenanceDetail).toEqual(DETAIL)

    // And the bytes really are in storage, not merely a row claiming they are.
    expect(await storage.exists(asset.storageKey)).toBe(true)
  })

  it('refuses a remote URL, so a prompt can never choose what the server fetches', async () => {
    const { save } = await library()

    await expect(
      save({
        dataUrl: 'https://example.com/cat.png',
        filename: 'cat',
        alt: 'A cat',
        provenanceDetail: DETAIL,
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_INVALID' })
  })

  it('refuses a type this site does not store, naming the ones it does', async () => {
    const { save } = await library()

    await expect(
      save({
        dataUrl: 'data:image/tiff;base64,AAAA',
        filename: 'scan',
        alt: 'A scan',
        provenanceDetail: DETAIL,
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_INVALID' })
  })

  it('refuses an empty image rather than storing a broken file', async () => {
    const { save } = await library()

    await expect(
      save({
        dataUrl: 'data:image/png;base64,',
        filename: 'nothing',
        alt: 'Nothing',
        provenanceDetail: DETAIL,
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_INVALID' })
  })

  it('never collides two images generated from the same prompt', async () => {
    const { save } = await library()
    const input = {
      dataUrl: `data:image/png;base64,${PNG_BASE64}`,
      filename: 'hero',
      alt: 'A hero image',
      provenanceDetail: DETAIL,
    }

    const first = await save(input)
    const second = await save(input)

    expect(first.id).not.toBe(second.id)
  })
})
