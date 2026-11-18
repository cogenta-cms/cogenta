import type { lookup } from 'node:dns/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDatabaseMediaStore,
  createLocalStorage,
  createSqliteHandle,
  type DatabaseHandle,
  type PinnedFetch,
} from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createUrlImageImporter, MAX_IMPORT_BYTES } from '../src/commands/media-import.js'

/**
 * The host side of `media.import_url`: real SQLite, real local storage, real
 * image bytes through the real ingest. Only the network is replaced — a fake
 * resolver decides what each host name resolves to, and a fake transport
 * answers the address that was checked — so the outbound guard is exercised
 * exactly as in production without reaching the internet.
 */

const dirs: string[] = []
const handles: DatabaseHandle[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map((db) => db.close()))
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/** A real 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const ADDRESSES: Readonly<Record<string, string>> = {
  'images.example.org': '93.184.216.34',
  'cdn.example.org': '93.184.216.35',
  'internal.example.org': '10.0.0.7',
}

const fakeLookup = (async (hostname: string) => {
  const address = ADDRESSES[hostname]
  if (address === undefined) throw new Error('ENOTFOUND')
  return [{ address, family: 4 }]
}) as unknown as typeof lookup

type Answer = (url: URL) => Response

async function importer(answer: Answer) {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-media-import-'))
  dirs.push(root)
  const db = await createSqliteHandle({ url: ':memory:' })
  handles.push(db)
  const mediaStore = createDatabaseMediaStore({ db })
  const storage = createLocalStorage({ path: join(root, 'uploads') })
  const requested: string[] = []
  const pinnedFetch: PinnedFetch = async (target) => {
    requested.push(`${target.url.href} @ ${target.address}`)
    return answer(target.url)
  }
  return {
    run: createUrlImageImporter({ mediaStore, storage, lookupImpl: fakeLookup, pinnedFetch }),
    mediaStore,
    requested,
  }
}

const png = () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })

describe('importing an image from an address', () => {
  it('stores the real bytes with the alt text and keeps the source and credit', async () => {
    const { run, mediaStore } = await importer(png)

    const imported = await run({
      url: 'https://images.example.org/photos/Data%20centre.png',
      alt: 'Rows of servers',
      credit: { author: 'Jane Doe', license: 'CC BY 4.0' },
      actorId: 'apikey:k1',
    })

    expect(imported).toMatchObject({ mimeType: 'image/png', byteLength: PNG.length })
    expect(imported.filename).toBe('Data-centre.png')
    const asset = await mediaStore.get(imported.id)
    expect(asset).toMatchObject({ alt: 'Rows of servers', createdBy: 'apikey:k1', kind: 'image' })
    expect(asset?.provenanceDetail).toMatchObject({
      importedFrom: 'https://images.example.org/photos/Data%20centre.png',
      author: 'Jane Doe',
      license: 'CC BY 4.0',
    })
  })

  it('follows a redirect to another public https host, checking it too', async () => {
    const { run, requested } = await importer((url) =>
      url.hostname === 'images.example.org'
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://cdn.example.org/real.png' },
          })
        : png(),
    )
    const imported = await run({ url: 'https://images.example.org/a.png', alt: 'x', actorId: null })
    expect(imported.mimeType).toBe('image/png')
    expect(requested).toEqual([
      'https://images.example.org/a.png @ 93.184.216.34',
      'https://cdn.example.org/real.png @ 93.184.216.35',
    ])
  })

  it('refuses a host that resolves to a private address, without connecting', async () => {
    const { run, requested } = await importer(png)
    await expect(
      run({ url: 'https://internal.example.org/a.png', alt: 'x', actorId: null }),
    ).rejects.toMatchObject({ code: 'HTTP_TARGET_UNSAFE' })
    expect(requested).toEqual([])
  })

  it('refuses a redirect into the private network', async () => {
    const { run, requested } = await importer(
      () =>
        new Response(null, {
          status: 301,
          headers: { location: 'https://internal.example.org/metadata' },
        }),
    )
    await expect(
      run({ url: 'https://images.example.org/a.png', alt: 'x', actorId: null }),
    ).rejects.toMatchObject({ code: 'HTTP_TARGET_UNSAFE' })
    expect(requested).toHaveLength(1)
  })

  it('refuses a redirect that downgrades to http', async () => {
    const { run } = await importer(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://cdn.example.org/a.png' },
        }),
    )
    await expect(
      run({ url: 'https://images.example.org/a.png', alt: 'x', actorId: null }),
    ).rejects.toMatchObject({ code: 'MEDIA_IMPORT_FAILED' })
  })

  it('refuses a page served instead of an image', async () => {
    const { run } = await importer(
      () =>
        new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    await expect(
      run({ url: 'https://images.example.org/a.png', alt: 'x', actorId: null }),
    ).rejects.toMatchObject({ code: 'MEDIA_TYPE_REJECTED' })
  })

  it('refuses bytes that are not an image even when labelled as one', async () => {
    const { run, mediaStore } = await importer(
      () =>
        new Response('<script>alert(1)</script>', {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    )
    await expect(
      run({ url: 'https://images.example.org/a.png', alt: 'x', actorId: null }),
    ).rejects.toMatchObject({ code: 'MEDIA_TYPE_REJECTED' })
    expect((await mediaStore.list()).items).toHaveLength(0)
  })

  it('refuses a file larger than the cap', async () => {
    const { run } = await importer(
      () =>
        new Response(new Uint8Array(MAX_IMPORT_BYTES + 1), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    )
    await expect(
      run({ url: 'https://images.example.org/a.png', alt: 'x', actorId: null }),
    ).rejects.toMatchObject({ code: 'HTTP_BODY_TOO_LARGE' })
  })

  it('keeps the source address without its query string or credentials', async () => {
    const { run, mediaStore } = await importer(png)
    const imported = await run({
      url: 'https://images.example.org/private.png?X-Amz-Signature=secret#frag',
      alt: 'x',
      agent: 'mcp:key "Publisher"',
      actorId: null,
    })
    const asset = await mediaStore.get(imported.id)
    expect(asset?.provenance).toBe('assisted')
    expect(asset?.provenanceDetail).toMatchObject({
      importedFrom: 'https://images.example.org/private.png',
      agent: 'mcp:key "Publisher"',
    })
    expect(JSON.stringify(asset?.provenanceDetail)).not.toContain('secret')
  })

  it('names a file whose address has a broken escape without failing', async () => {
    const { run } = await importer(png)
    const imported = await run({
      url: 'https://images.example.org/a%zz.png',
      alt: 'x',
      actorId: null,
    })
    expect(imported.filename).toMatch(/\.png$/u)
  })

  it('reports a redirect to an invalid address', async () => {
    const { run } = await importer(
      () =>
        new Response(null, { status: 302, headers: { location: 'https://exa mple.org:99999/' } }),
    )
    await expect(
      run({ url: 'https://images.example.org/a.png', alt: 'x', actorId: null }),
    ).rejects.toMatchObject({ code: 'MEDIA_IMPORT_FAILED' })
  })

  it('reports a missing file without storing anything', async () => {
    const { run } = await importer(() => new Response('gone', { status: 404 }))
    await expect(
      run({ url: 'https://images.example.org/a.png', alt: 'x', actorId: null }),
    ).rejects.toMatchObject({ code: 'MEDIA_IMPORT_FAILED', details: { status: 404 } })
  })
})
