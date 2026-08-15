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
  const root = await mkdtemp(join(tmpdir(), 'cogenta-images-'))
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

describe('cogenta serve — images (L10 task 5)', () => {
  it('an uploaded image records its real dimensions and gets several stored variants', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const asset = await upload(server.base, token, makePng(1000, 500))

      // Probed from the bytes, not taken from the request: nothing in the
      // upload body says how big the image is.
      expect(asset.width).toBe(1000)
      expect(asset.height).toBe(500)

      // The ladder capped at the intrinsic width: 320, 640, 960 and 1000.
      // Each rendition is decoded again and measured — asserting on byte
      // counts would only prove the responses differ, not that they are the
      // sizes they claim to be.
      const { createImageRegistry } = await import('@cogenta/render')
      const { createLogger } = await import('@cogenta/core')
      const driver = await createImageRegistry({
        logger: createLogger({ level: 'silent' }),
      }).select({})
      try {
        for (const width of [320, 640, 960, 1000]) {
          const response = await fetch(`${server.base}/_image?id=${asset.id}&w=${width}`)
          expect(response.status).toBe(200)
          expect(response.headers.get('content-type')).toBe('image/webp')
          const bytes = new Uint8Array(await response.arrayBuffer())
          const metadata = await driver.instance.metadata(bytes)
          expect(metadata.width).toBe(width)
          expect(metadata.format).toBe('webp')
          // The aspect ratio survives: 1000×500 resized to 320 is 320×160.
          expect(metadata.height).toBe(Math.round(width / 2))
        }
      } finally {
        await driver.dispose()
      }
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('the image endpoint is public, and only for images', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const asset = await upload(server.base, token, makePng(800, 600))

      // No session at all: a visitor's browser has none, and a published
      // page's <img> must still load.
      const anonymous = await fetch(`${server.base}/_image?id=${asset.id}&w=640`)
      expect(anonymous.status).toBe(200)
      expect((await anonymous.arrayBuffer()).byteLength).toBeGreaterThan(0)

      // The authenticated route is unchanged: everything that is not an
      // image still needs a session there.
      const authenticated = await fetch(`${server.base}/api/media/${asset.id}/file`)
      expect(authenticated.status).toBe(401)

      expect((await fetch(`${server.base}/_image`)).status).toBe(400)
      expect((await fetch(`${server.base}/_image?id=nope`)).status).toBe(404)

      // And the ids it is keyed on are not enumerable: the library itself
      // needs a session, so an unguessable URL stays unguessable.
      expect((await fetch(`${server.base}/api/media`)).status).toBe(401)
      expect((await fetch(`${server.base}/api/media/${asset.id}`)).status).toBe(401)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('never serves an image with a content type that could execute on the site origin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)

      // A genuine PNG announced as a document by the uploader. The upload is
      // accepted — the bytes really are a PNG — but nothing downstream may
      // repeat the claim: this endpoint is public, cacheable for a year and
      // on the same origin as the admin.
      const response = await fetch(`${server.base}/api/media`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'image',
          filename: 'disguised.png',
          mimeType: 'text/html',
          data: makePng(400, 300).toString('base64'),
          alt: 'x',
        }),
      })
      expect(response.status).toBe(201)
      const asset = ((await response.json()) as { data: Asset }).data

      const served = await fetch(`${server.base}/_image?id=${asset.id}`)
      expect(served.status).toBe(200)
      expect(served.headers.get('content-type')).toBe('image/png')
      await served.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('falls back to the original for a width nobody stored, rather than rendering on demand', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const asset = await upload(server.base, token, makePng(800, 600))

      const odd = await fetch(`${server.base}/_image?id=${asset.id}&w=713`)
      expect(odd.status).toBe(200)
      // The original PNG, not a freshly encoded 713px WebP: a public URL
      // must not be a way to spend CPU.
      expect(odd.headers.get('content-type')).toBe('image/png')
      // Read the body: an unread response holds its socket open, which is
      // what `SHUTDOWN_GRACE_MS` exists to survive — but a test should not
      // be the thing exercising it by accident.
      expect((await odd.arrayBuffer()).byteLength).toBeGreaterThan(0)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('renders a real srcset in the page, and an og:image derived from the same asset', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const asset = await upload(server.base, token, makePng(1000, 500), 'A wide gradient')

      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            values: { title: 'With a picture', slug: 'with-a-picture', cover: asset.id },
            blocks: {
              body: [
                {
                  key: 'figure-1',
                  type: 'mediaFigure',
                  data: { media: asset.id, caption: 'A wide gradient' },
                },
              ],
            },
          }),
        })
      ).json()) as { data: { id: string } }
      await fetch(`${server.base}/api/content/page/${created.data.id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      const html = await (await fetch(`${server.base}/with-a-picture`)).text()

      expect(html).toContain('srcset=')
      expect(html).toContain(`/_image?id=${asset.id}&amp;w=320 320w`)
      expect(html).toContain(`/_image?id=${asset.id}&amp;w=960 960w`)
      // Alt text comes from the media entity, never invented by the theme.
      expect(html).toContain('alt="A wide gradient"')

      // The same asset, absolute, as the social image: a crawler follows no
      // relative path and sends no session.
      expect(html).toContain(
        `<meta property="og:image" content="https://example.com/_image?id=${asset.id}&amp;w=1000" />`,
      )
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('deleting an asset takes its variants with it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct horse battery staple', [
        'admin',
        'editor',
      ])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )
      const asset = await upload(server.base, token, makePng(800, 600))
      const before = await fetch(`${server.base}/_image?id=${asset.id}&w=640`)
      expect(before.status).toBe(200)
      expect((await before.arrayBuffer()).byteLength).toBeGreaterThan(0)

      const deleted = await fetch(`${server.base}/api/media/${asset.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(deleted.status).toBe(204)
      expect((await fetch(`${server.base}/_image?id=${asset.id}&w=640`)).status).toBe(404)
    } finally {
      await server.stop()
    }
  }, 60_000)
})
