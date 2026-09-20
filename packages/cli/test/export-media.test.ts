import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabaseMediaStore, createLocalStorage, createSqliteHandle } from '@cogenta/core'
import { openZip } from '@cogenta/export'
import { type CollectionDefinition, createContentStore, createSchemaTables } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { run } from '../src/index.js'

/**
 * `cogenta export` used to print "7 media references" over a file that held
 * none, and the entries it imported pointed at seven identifiers the target
 * could not resolve. These tests are end to end on purpose: the counter and
 * the file have to agree in the command a person actually runs, not only in
 * the generator underneath it.
 */

const PHOTO: CollectionDefinition = {
  name: 'photo',
  labels: { singular: 'Photo', plural: 'Photos' },
  fields: {
    title: { kind: 'text', options: { max: 200 } },
    image: { kind: 'media', options: {} },
    blocks: { kind: 'blocks', options: {} },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}
const COLLECTIONS: readonly CollectionDefinition[] = [PHOTO]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-export-media-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Media site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  await mkdir(join(root, 'migrations'), { recursive: true })
  return root
}

async function mediaCount(root: string): Promise<number> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  const media = createDatabaseMediaStore({ db })
  const count = await media.count()
  await db.close()
  return count
}

async function seed(root: string): Promise<readonly string[]> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await createSchemaTables(db, COLLECTIONS)
  const media = createDatabaseMediaStore({ db })
  const storage = createLocalStorage({ path: join(root, 'media') })
  const store = createContentStore({ db, collection: PHOTO })

  const ids: string[] = []
  for (const index of [1, 2, 3]) {
    const key = `uploads/photo-${index}.png`
    await storage.put(key, Buffer.from(`bytes of photo ${index}`))
    const asset = await media.create({
      kind: 'image',
      filename: `photo-${index}.png`,
      mimeType: 'image/png',
      size: 22,
      alt: `Photo number ${index}`,
      storageKey: key,
    })
    ids.push(asset.id)
    await store.create({
      status: 'published',
      values: { title: `Photo ${index}`, image: asset.id },
    })
  }
  await db.close()
  return ids
}

/**
 * A medium referenced only from inside a contract B block, never from a
 * declared `f.media()` field — where most of a real site's pictures actually
 * live (a hero, a gallery, a mediaFigure). The export package cannot see
 * these on its own: reading block data means reading the block vocabulary,
 * which it deliberately does not depend on.
 */
async function seedBlockOnlyMedium(root: string): Promise<string> {
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  const media = createDatabaseMediaStore({ db })
  const storage = createLocalStorage({ path: join(root, 'media') })
  const store = createContentStore({ db, collection: PHOTO })

  const key = 'uploads/in-a-block.png'
  await storage.put(key, Buffer.from('bytes inside a block'))
  const asset = await media.create({
    kind: 'image',
    filename: 'in-a-block.png',
    mimeType: 'image/png',
    size: 20,
    alt: 'Only ever referenced from a block',
    storageKey: key,
  })
  await store.create({
    status: 'published',
    values: { title: 'A page whose picture lives in a block' },
    blocks: {
      blocks: [
        {
          key: 'figure-1',
          type: 'mediaFigure',
          data: { media: asset.id, caption: 'Only ever referenced from a block' },
        },
      ],
    },
  })
  await db.close()
  return asset.id
}

describe('cogenta export, for the media its entries point at', () => {
  it('writes as many media-ref records as the number it reports', async () => {
    const root = await project()
    const ids = await seed(root)

    const out: string[] = []
    const err: string[] = []
    const file = join(root, 'content.ndjson')
    const code = await run({
      argv: ['export', file, '--cwd', root],
      stdout: (t) => void out.push(t),
      stderr: (t) => void err.push(t),
      env: {},
    })
    expect(err.join('')).toBe('')
    expect(code).toBe(0)
    expect(out.join('')).toContain('3 media references')

    const records = (await readFile(file, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { kind: string; id?: string })
    const refs = records.filter((record) => record.kind === 'media-ref')
    expect(refs.map((r) => r.id).sort()).toEqual([...ids].sort())
  })

  it('carries a medium that only a block references, not just the declared media fields', async () => {
    const root = await project()
    await seed(root)
    const inBlock = await seedBlockOnlyMedium(root)

    const out: string[] = []
    const file = join(root, 'content.ndjson')
    const code = await run({
      argv: ['export', file, '--cwd', root],
      stdout: (t) => void out.push(t),
      stderr: () => undefined,
      env: {},
    })
    expect(code).toBe(0)

    const refs = (await readFile(file, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { kind: string; id?: string })
      .filter((record) => record.kind === 'media-ref')
    expect(refs.map((r) => r.id)).toContain(inBlock)
    expect(out.join('')).toContain('4 media references')
  })

  it('leaves no entry of the imported site pointing at a medium that is not there', async () => {
    const source = await project()
    const target = await project()
    const ids = await seed(source)

    const file = join(source, 'content.ndjson')
    await run({
      argv: ['export', file, '--cwd', source],
      stdout: () => undefined,
      stderr: () => undefined,
      env: {},
    })

    const out: string[] = []
    const err: string[] = []
    const code = await run({
      argv: ['import', 'content', file, '--cwd', target],
      stdout: (t) => void out.push(t),
      stderr: (t) => void err.push(t),
      env: {},
    })
    expect(err.join('')).toBe('')
    expect(code).toBe(0)
    expect(out.join('')).toContain('media: 3')

    const db = await createSqliteHandle({ url: join(target, 'site.db') })
    const entries = await createContentStore({ db, collection: PHOTO }).list({ state: 'working' })
    const media = createDatabaseMediaStore({ db })
    const dangling: string[] = []
    for (const entry of entries.items) {
      const id = entry.values.image
      if (typeof id !== 'string') continue
      if ((await media.get(id)) === null) dangling.push(id)
    }
    await db.close()

    expect(entries.items).toHaveLength(3)
    expect(
      dangling,
      'Media ids the imported entries point at that the target has no row for',
    ).toEqual([])
    expect([...ids].sort()).toEqual(
      entries.items.map((entry) => entry.values.image as string).sort(),
    )
  })

  it('writes the real bytes only when asked for the archive', async () => {
    const root = await project()
    await seed(root)

    const plain = join(root, 'plain.ndjson')
    await run({
      argv: ['export', plain, '--cwd', root],
      stdout: () => undefined,
      stderr: () => undefined,
      env: {},
    })
    await expect(stat(join(root, 'media.zip'))).rejects.toMatchObject({ code: 'ENOENT' })

    const out: string[] = []
    const withArchive = join(root, 'with-archive.ndjson')
    const archive = join(root, 'media.zip')
    const code = await run({
      argv: ['export', withArchive, '--cwd', root, '--media-archive', archive],
      stdout: (t) => void out.push(t),
      stderr: () => undefined,
      env: {},
    })
    expect(code).toBe(0)
    expect(out.join('')).toContain('3 media files archived')

    const zip = await openZip(archive)
    const names = zip.entries.map((entry) => entry.name)
    expect(names).toContain('manifest.json')
    expect(names.filter((name) => name.startsWith('media/'))).toHaveLength(3)

    const parts: Buffer[] = []
    const first = names.find((name) => name.endsWith('photo-1.png'))
    if (first === undefined) throw new Error('expected photo-1.png in the archive')
    for await (const chunk of zip.read(first)) parts.push(chunk)
    expect(Buffer.concat(parts).toString('utf8')).toBe('bytes of photo 1')
    await zip.close()

    // The NDJSON is the same either way (bar the manifest's own timestamp):
    // the archive is a second file, never bytes smuggled into the text export.
    const withoutManifest = async (path: string): Promise<string> =>
      (await readFile(path, 'utf8'))
        .split('\n')
        .filter((line) => line.length > 0 && !line.includes('"kind":"manifest"'))
        .join('\n')
    expect(await withoutManifest(plain)).toBe(await withoutManifest(withArchive))
  })

  it('imports twice without duplicating a medium', async () => {
    const source = await project()
    const target = await project()
    await seed(source)

    const file = join(source, 'content.ndjson')
    await run({
      argv: ['export', file, '--cwd', source],
      stdout: () => undefined,
      stderr: () => undefined,
      env: {},
    })
    for (const _ of [1, 2]) {
      await run({
        argv: ['import', 'content', file, '--cwd', target],
        stdout: () => undefined,
        stderr: () => undefined,
        env: {},
      })
    }

    expect(await mediaCount(target)).toBe(3)
  })
})
