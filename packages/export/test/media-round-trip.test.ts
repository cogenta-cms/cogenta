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
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createSchemaTables,
  defineCollection,
  f,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type ExportResult, exportContent } from '../src/content-export.js'
import { importContent } from '../src/content-import.js'
import { decodeRecord, type ExportMediaRefRecord } from '../src/format.js'

/**
 * The medium an entry points at has to survive the round trip, or the entry
 * lands in the target holding an identifier nothing resolves — a broken image
 * on every page that shows it, reported as a success by the command that
 * caused it.
 *
 * `cogenta export` counted the media it found and never wrote a single
 * `media-ref` line; these tests are the difference between "the counter says
 * seven" and "seven records are in the file, and seven assets exist in the
 * target afterwards".
 */

const photo: CollectionDefinition = defineCollection({
  name: 'photo',
  labels: { singular: 'Photo', plural: 'Photos' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    image: f.media({ accept: ['image'] }),
    gallery: f.media({ accept: ['image'], many: true }),
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

const collections = [photo]

interface Site {
  readonly db: DatabaseHandle
  readonly store: ContentStore
  readonly media: MediaStore
  readonly storage: StorageDriver
}

async function makeSite(directory: string, name: string): Promise<Site> {
  const db = await createSqliteHandle({ url: join(directory, `${name}.db`) })
  await createSchemaTables(db, collections, [])
  const media = createDatabaseMediaStore({ db })
  // The store creates its table on first use; `list` is the cheapest call
  // that does so without writing.
  await media.list({ limit: 1 })
  return {
    db,
    store: createContentStore({ db, collection: photo, siblings: collections }),
    media,
    storage: createLocalStorage({ path: join(directory, `${name}-storage`) }),
  }
}

async function drain(
  generator: AsyncGenerator<string, ExportResult>,
): Promise<{ lines: string[]; result: ExportResult }> {
  const lines: string[] = []
  for (;;) {
    const step = await generator.next()
    if (step.done === true) return { lines, result: step.value }
    lines.push(step.value)
  }
}

describe('exportContent, for the media an entry points at', () => {
  let directory: string
  let source: Site
  let target: Site

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-media-round-trip-'))
    source = await makeSite(directory, 'source')
    target = await makeSite(directory, 'target')
  })

  afterEach(async () => {
    await source.db.close()
    await target.db.close()
    await rm(directory, { recursive: true, force: true })
  })

  async function seed(): Promise<{ cover: string; gallery: readonly string[] }> {
    await source.storage.put('media/cover.png', Buffer.from('cover bytes'))
    const cover = await source.media.create({
      kind: 'image',
      filename: 'cover.png',
      mimeType: 'image/png',
      size: 11,
      width: 800,
      height: 600,
      alt: 'The cover, described for a screen reader',
      storageKey: 'media/cover.png',
      provenance: 'generated',
      provenanceDetail: { model: 'a-model' },
    })
    const gallery: string[] = []
    for (const index of [1, 2]) {
      await source.storage.put(`media/shot-${index}.jpg`, Buffer.from(`shot ${index}`))
      const asset = await source.media.create({
        kind: 'image',
        filename: `shot-${index}.jpg`,
        mimeType: 'image/jpeg',
        size: 7,
        alt: `Shot ${index}`,
        storageKey: `media/shot-${index}.jpg`,
      })
      gallery.push(asset.id)
    }
    await source.store.create({
      status: 'published',
      values: { title: 'A photo essay', image: cover.id, gallery },
    })
    return { cover: cover.id, gallery }
  }

  it('writes one media-ref record for every medium it counted', async () => {
    const seeded = await seed()

    const { lines, result } = await drain(
      exportContent({
        db: source.db,
        site: { name: 'Source', url: 'https://example.test' },
        collections,
        taxonomies: [],
        storeFor: () => source.store,
        taxonomyStoreFor: () => {
          throw new Error('no taxonomies in this fixture')
        },
        media: source.media,
      }),
    )

    const records = lines.map((line, index) => decodeRecord(line, index + 1))
    const manifest = records[0]
    if (manifest?.kind !== 'manifest') throw new Error('expected a manifest first')

    const refs = records.filter((r): r is ExportMediaRefRecord => r.kind === 'media-ref')
    expect(refs.map((ref) => ref.id).sort()).toEqual([seeded.cover, ...seeded.gallery].sort())
    // The counter the command prints and the file's contents are the same
    // number, which is the whole point: "3 media references" was printed over
    // a file containing none.
    expect(refs).toHaveLength(result.mediaIds.length)
    expect(refs).toHaveLength(3)
    // The number the command prints is the number of records in the file,
    // not the number it hoped to write.
    expect(result.counts.mediaRefs).toBe(3)

    const coverRef = refs.find((ref) => ref.id === seeded.cover)
    expect(coverRef).toMatchObject({
      filename: 'cover.png',
      mimeType: 'image/png',
      storageKey: 'media/cover.png',
      mediaKind: 'image',
      alt: 'The cover, described for a screen reader',
      width: 800,
      height: 600,
      provenance: 'generated',
    })
  })

  it('leaves no entry pointing at a medium the target does not have', async () => {
    const seeded = await seed()

    const { lines } = await drain(
      exportContent({
        db: source.db,
        site: { name: 'Source', url: 'https://example.test' },
        collections,
        taxonomies: [],
        storeFor: () => source.store,
        taxonomyStoreFor: () => {
          throw new Error('no taxonomies in this fixture')
        },
        media: source.media,
      }),
    )

    async function* asLines(): AsyncGenerator<string> {
      for (const line of lines) yield line
    }

    const report = await importContent(asLines(), {
      collections,
      taxonomies: [],
      storeFor: () => target.store,
      taxonomyStoreFor: () => {
        throw new Error('no taxonomies in this fixture')
      },
      media: target.media,
    })

    expect(report.errors).toEqual([])
    expect(report.mediaRefs).toBe(3)

    const page = await target.store.list({ state: 'working' })
    expect(page.items).toHaveLength(1)
    const entry = page.items[0]
    if (entry === undefined) throw new Error('expected the entry to be imported')

    const referenced = [entry.values.image as string, ...(entry.values.gallery as string[])]
    const dangling: string[] = []
    for (const id of referenced) {
      if ((await target.media.get(id)) === null) dangling.push(id)
    }
    expect(
      dangling,
      'Media ids the imported entry points at that the target does not have',
    ).toEqual([])

    const cover = await target.media.get(seeded.cover)
    expect(cover?.filename).toBe('cover.png')
    expect(cover?.storageKey).toBe('media/cover.png')
    expect(cover?.alt).toBe('The cover, described for a screen reader')
    // Provenance is the one field that must never be guessed: importing an
    // AI-generated image as `human` would make the only field the EU AI Act
    // requires say the opposite of the truth.
    expect(cover?.provenance).toBe('generated')
  })

  it('leaves an asset the target already has exactly as it is', async () => {
    const seeded = await seed()
    await target.media.create({
      id: seeded.cover,
      kind: 'image',
      filename: 'already-here.png',
      mimeType: 'image/png',
      size: 1,
      alt: 'The copy the target already had',
      storageKey: 'media/already-here.png',
    })

    const { lines } = await drain(
      exportContent({
        db: source.db,
        site: { name: 'Source', url: 'https://example.test' },
        collections,
        taxonomies: [],
        storeFor: () => source.store,
        taxonomyStoreFor: () => {
          throw new Error('no taxonomies in this fixture')
        },
        media: source.media,
      }),
    )

    async function* asLines(): AsyncGenerator<string> {
      for (const line of lines) yield line
    }

    const report = await importContent(asLines(), {
      collections,
      taxonomies: [],
      storeFor: () => target.store,
      taxonomyStoreFor: () => {
        throw new Error('no taxonomies in this fixture')
      },
      media: target.media,
    })

    expect(report.errors).toEqual([])
    expect(report.mediaRefs).toBe(2)
    expect((await target.media.get(seeded.cover))?.filename).toBe('already-here.png')
  })

  it('still exports without a media store, and says so by carrying no media-ref', async () => {
    await seed()

    const { lines, result } = await drain(
      exportContent({
        db: source.db,
        site: { name: 'Source', url: 'https://example.test' },
        collections,
        taxonomies: [],
        storeFor: () => source.store,
        taxonomyStoreFor: () => {
          throw new Error('no taxonomies in this fixture')
        },
      }),
    )

    const records = lines.map((line, index) => decodeRecord(line, index + 1))
    expect(records.filter((r) => r.kind === 'media-ref')).toEqual([])
    expect(result.counts.mediaRefs).toBe(0)
    // The ids are still returned, so a caller that wants the archive instead
    // of the references has what it needs.
    expect(result.mediaIds).toHaveLength(3)
  })
})
