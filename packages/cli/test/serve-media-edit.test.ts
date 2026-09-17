import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { makePng } from './helpers/png.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L10 task 5, end to end: upload → variants → `srcset` in the rendered page.
 *
 * Real bytes, a real image driver, a real storage driver, a real server. The
 * pipeline in `@cogenta/render` has always been unit-tested against values;
 * what had never happened is an actual upload producing actual renditions
 * that an actual `<img>` then points at.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      cover: { kind: 'media', options: { accept: ['image'] } },
      body: { kind: 'blocks', options: { allow: '*' } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
      publish: ['editor'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-media-edit-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
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
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

interface Asset {
  readonly id: string
  readonly width: number | null
  readonly height: number | null
}

async function upload(
  base: string,
  token: string,
  bytes: Buffer,
  alt = 'A generated gradient',
): Promise<Asset> {
  const response = await fetch(`${base}/api/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      kind: 'image',
      filename: 'gradient.png',
      mimeType: 'image/png',
      data: bytes.toString('base64'),
      alt,
    }),
  })
  if (response.status !== 201) {
    throw new Error(`upload failed: ${response.status} ${await response.text()}`)
  }
  return ((await response.json()) as { data: Asset }).data
}

async function signIn(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

/**
 * L39 end to end, with the host's real image driver: an image is turned and
 * cropped in place — the served file has the new dimensions, every page keeps
 * its reference — and put back as it was.
 */
async function sizeOf(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const { createImageRegistry } = await import('@cogenta/render')
  const { createLogger } = await import('@cogenta/core')
  const driver = await createImageRegistry({ logger: createLogger({ level: 'silent' }) }).select({})
  try {
    const metadata = await driver.instance.metadata(bytes)
    return { width: metadata.width, height: metadata.height }
  } finally {
    await driver.instance.dispose()
  }
}

describe('cogenta serve — cropping and rotating an image (L39)', () => {
  it('turns and crops the stored file, then restores the original', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
      const asset = await upload(server.base, token, makePng(400, 200))
      const original = Buffer.from(
        await (await fetch(`${server.base}/api/media/${asset.id}/file`, { headers })).arrayBuffer(),
      )

      const edited = await fetch(`${server.base}/api/media/${asset.id}/edit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ rotate: 90, crop: { x: 0, y: 0, width: 1, height: 0.5 } }),
      })
      expect(edited.status).toBe(200)
      const editedAsset = ((await edited.json()) as { data: Asset & { edited: boolean } }).data
      // A 400x200 picture turned a quarter is 200x400; its top half is 200x200.
      expect([editedAsset.width, editedAsset.height, editedAsset.edited]).toEqual([200, 200, true])

      const served = await fetch(`${server.base}/api/media/${asset.id}/file`, { headers })
      expect(await sizeOf(new Uint8Array(await served.arrayBuffer()))).toEqual({
        width: 200,
        height: 200,
      })
      expect((await fetch(`${server.base}/_image?id=${asset.id}&w=320`)).status).toBe(200)

      const restored = await fetch(`${server.base}/api/media/${asset.id}/restore`, {
        method: 'POST',
        headers,
      })
      const restoredAsset = ((await restored.json()) as { data: Asset & { edited: boolean } }).data
      expect([restoredAsset.width, restoredAsset.height, restoredAsset.edited]).toEqual([
        400,
        200,
        false,
      ])
      const back = Buffer.from(
        await (await fetch(`${server.base}/api/media/${asset.id}/file`, { headers })).arrayBuffer(),
      )
      expect(back.equals(original)).toBe(true)
    } finally {
      await server.stop()
    }
  }, 60_000)
})
