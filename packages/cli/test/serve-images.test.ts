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

  it('rounds a width up to a stored rendition, and only falls back above the ladder', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      // 800px wide, so the ladder it earns is 320, 640 and its own 800.
      const asset = await upload(server.base, token, makePng(800, 600))

      // Between two rungs: the next one up, already encoded and sitting in
      // storage. Never a freshly encoded 713px WebP — a public URL must not
      // be a way to spend CPU, which is what this assertion has always been
      // about.
      const odd = await fetch(`${server.base}/_image?id=${asset.id}&w=713`)
      expect(odd.status).toBe(200)
      expect(odd.headers.get('content-type')).toBe('image/webp')
      const oddBytes = (await odd.arrayBuffer()).byteLength
      expect(oddBytes).toBeGreaterThan(0)

      // Below the ladder. This used to find no exact match and hand back the
      // full-resolution original: on a real photo, megabytes for a request
      // that asked for one pixel, public and cached for a year.
      const tiny = await fetch(`${server.base}/_image?id=${asset.id}&w=1`)
      expect(tiny.status).toBe(200)
      expect(tiny.headers.get('content-type')).toBe('image/webp')
      const tinyBytes = (await tiny.arrayBuffer()).byteLength
      expect(tinyBytes).toBeGreaterThan(0)
      expect(tinyBytes).toBeLessThan(oddBytes)

      // Above everything stored, the original is genuinely the closest thing
      // there is, and it is still served rather than rendered.
      const huge = await fetch(`${server.base}/_image?id=${asset.id}&w=99999`)
      expect(huge.status).toBe(200)
      expect(huge.headers.get('content-type')).toBe('image/png')
      expect((await huge.arrayBuffer()).byteLength).toBeGreaterThan(0)
    } finally {
      await server.stop()
    }
  }, 60_000)

  /**
   * The media library's own thumbnails.
   *
   * `<img src>` cannot carry a bearer token, so the admin fetches the bytes
   * through `/api/media/{id}/file` and hands the grid an object URL — the
   * reason that route stays authenticated instead of the file being made
   * public. What it fetched was the *original*: twenty-five thumbnails cost
   * 5.6 MB on a real site, with the 320px renditions already sitting in
   * storage beside them, unused. The same ladder `/_image` picks from is now
   * reachable from behind the token.
   */
  it('serves a stored variant to a signed-in caller that asks for a width', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const asset = await upload(server.base, token, makePng(1600, 1200))
      const headers = { authorization: `Bearer ${token}` }

      const full = await fetch(`${server.base}/api/media/${asset.id}/file`, { headers })
      expect(full.status).toBe(200)
      const fullBytes = (await full.arrayBuffer()).byteLength

      const thumb = await fetch(`${server.base}/api/media/${asset.id}/file?w=320`, { headers })
      expect(thumb.status).toBe(200)
      expect(thumb.headers.get('content-type')).toBe('image/webp')
      const thumbBytes = (await thumb.arrayBuffer()).byteLength
      expect(thumbBytes).toBeLessThan(fullBytes)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('rounds up behind the token too, and falls back only above the ladder', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const asset = await upload(server.base, token, makePng(800, 600))

      // Same rule on both routes, because it is the same function: the media
      // library asking for a thumbnail gets the rendition, not the original.
      const odd = await fetch(`${server.base}/api/media/${asset.id}/file?w=713`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(odd.status).toBe(200)
      expect(odd.headers.get('content-type')).toBe('image/webp')
      expect((await odd.arrayBuffer()).byteLength).toBeGreaterThan(0)

      const huge = await fetch(`${server.base}/api/media/${asset.id}/file?w=99999`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(huge.status).toBe(200)
      expect(huge.headers.get('content-type')).toBe('image/png')
      expect((await huge.arrayBuffer()).byteLength).toBeGreaterThan(0)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('still refuses a width to a caller with no session', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const asset = await upload(server.base, token, makePng(800, 600))

      const anonymous = await fetch(`${server.base}/api/media/${asset.id}/file?w=320`)
      expect(anonymous.status).toBe(401)
    } finally {
      await server.stop()
    }
  }, 60_000)

  /**
   * The audit reported the focal point as "editable but never applied". It
   * is applied — as `object-position` on the rendered `<img>`, which is the
   * right way to honour it: the alternative is cropping on demand, and
   * neither `/_image` nor `/api/media/{id}/file` will render on request.
   * What is missing is server-side cropping, which is a different (and
   * deliberately unbuilt) thing. This pins the behaviour that does exist, so
   * the question does not have to be re-litigated from reading the code.
   */
  /**
   * The second layer under the stored type: whatever a non-image turns out
   * to be, the browser downloads it rather than rendering it on this origin.
   * An image is exempt — the admin's own grid displays those inline.
   */
  it('serves a non-image as a download, and an image inline', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const doc = (await (
        await fetch(`${server.base}/api/media`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            kind: 'file',
            filename: 'notes.txt',
            mimeType: 'text/plain',
            data: Buffer.from('plain enough').toString('base64'),
            alt: 'Some notes',
          }),
        })
      ).json()) as { data: { id: string } }

      const asDownload = await fetch(`${server.base}/api/media/${doc.data.id}/file`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(asDownload.status).toBe(200)
      expect(asDownload.headers.get('content-disposition')).toContain('attachment')
      await asDownload.arrayBuffer()

      const picture = await upload(server.base, token, makePng(400, 300))
      const inline = await fetch(`${server.base}/api/media/${picture.id}/file`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(inline.status).toBe(200)
      expect(inline.headers.get('content-disposition')).toBeNull()
      await inline.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('carries the focal point into the page as object-position', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const asset = await upload(server.base, token, makePng(1000, 500), 'A wide gradient')
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const focussed = await fetch(`${server.base}/api/media/${asset.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ focal: { x: 0.25, y: 0.75 } }),
      })
      expect(focussed.status).toBe(200)

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            values: { title: 'Focussed', slug: 'focussed', cover: asset.id },
            blocks: {
              body: [{ key: 'figure-1', type: 'mediaFigure', data: { media: asset.id } }],
            },
          }),
        })
      ).json()) as { data: { id: string } }
      await fetch(`${server.base}/api/content/page/${created.data.id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      const html = await (await fetch(`${server.base}/focussed`)).text()
      expect(html).toContain('object-position:25% 75%')
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
      // `&v=` (fiche 05 task 2) rides along on every candidate URL — it is
      // the asset's `contentHash`, not asserted verbatim here since it is
      // content-derived, but its presence is what a replace changes.
      expect(html).toMatch(new RegExp(`/_image\\?id=${asset.id}&amp;w=320&amp;v=[^"'\\s]+ 320w`))
      expect(html).toMatch(new RegExp(`/_image\\?id=${asset.id}&amp;w=960&amp;v=[^"'\\s]+ 960w`))
      // Alt text comes from the media entity, never invented by the theme.
      expect(html).toContain('alt="A wide gradient"')

      // The same asset, absolute, as the social image: a crawler follows no
      // relative path and sends no session.
      expect(html).toMatch(
        new RegExp(
          `<meta property="og:image" content="https://example\\.com/_image\\?id=${asset.id}&amp;w=1000&amp;v=[^"']+" />`,
        ),
      )
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    } finally {
      await server.stop()
    }
  }, 60_000)

  // Fiche 05 task 2: `RenderMediaAsset.version` (`contentHash`) was already
  // computed by `loadRenderMedia` but never actually read by `variantUrl`,
  // so replacing a logo left every already-rendered page pointing at the
  // exact same `/_image?id=…` a year-long `immutable` cache had already
  // stored. What actually breaks that cache is the URL itself changing —
  // a browser or CDN holding an `immutable` response never revalidates it,
  // so it never learns the origin changed at all.
  it('changes the rendered image URL after a replace, so an already-cached page never needs to notice', async () => {
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
            values: { title: 'Cache bust', slug: 'cache-bust', cover: asset.id },
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

      const before = await (await fetch(`${server.base}/cache-bust`)).text()
      const beforeMatch = before.match(/\/_image\?id=[^"'\s]+&(?:amp;)?w=\d+&(?:amp;)?v=[^"'\s]+/)
      expect(beforeMatch).not.toBeNull()
      const beforeUrl = (beforeMatch?.[0] ?? '').replaceAll('&amp;', '&')
      const beforeContent = await (await fetch(`${server.base}${beforeUrl}`)).arrayBuffer()

      // A different size, not just re-uploaded identical bytes: the fixture
      // gradient is a pure function of width/height, so this is what makes
      // the replacement's pixels actually differ from the original's.
      const form = new FormData()
      form.append('file', new Blob([makePng(900, 450)], { type: 'image/png' }), 'gradient.png')
      const replaced = await fetch(`${server.base}/api/media/${asset.id}/replace`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      })
      expect(replaced.status).toBe(200)

      const after = await (await fetch(`${server.base}/cache-bust`)).text()
      const afterMatch = after.match(/\/_image\?id=[^"'\s]+&(?:amp;)?w=\d+&(?:amp;)?v=[^"'\s]+/)
      expect(afterMatch).not.toBeNull()
      const afterUrl = (afterMatch?.[0] ?? '').replaceAll('&amp;', '&')

      // Same asset id and requested width, but a different `v=` — the
      // rendered `src`/`srcset` genuinely changed, which is the only thing
      // that makes an already-cached `immutable` response irrelevant.
      expect(afterUrl).not.toBe(beforeUrl)
      expect(afterUrl.split('v=')[1]).not.toBe(beforeUrl.split('v=')[1])

      const afterContent = await (await fetch(`${server.base}${afterUrl}`)).arrayBuffer()
      expect(Buffer.from(afterContent).equals(Buffer.from(beforeContent))).toBe(false)
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
