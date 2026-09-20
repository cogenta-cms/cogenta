import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { makePng } from './helpers/png.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Deleting a media asset that a published page still points at.
 *
 * Until this suite existed, that was an HTTP 500 on the public page — for
 * everyone, for ever, with nothing in the admin saying which page was down.
 * `renderPage` draws every block of a page in one call and contract D's
 * `RenderContext.image()` has no "this asset is gone" answer to give, so one
 * dead reference took the whole document with it.
 *
 * The page must instead render as if no image had been chosen there: the
 * gallery keeps the pictures it still has, and a figure that is nothing but
 * its picture leaves the page rather than breaking it.
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
  const root = await mkdtemp(join(tmpdir(), 'cogenta-missing-media-'))
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

async function upload(base: string, token: string, alt: string): Promise<string> {
  const response = await fetch(`${base}/api/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      kind: 'image',
      filename: `${alt.replaceAll(' ', '-')}.png`,
      mimeType: 'image/png',
      data: makePng(600, 400).toString('base64'),
      alt,
    }),
  })
  if (response.status !== 201) {
    throw new Error(`upload failed: ${response.status} ${await response.text()}`)
  }
  return ((await response.json()) as { data: { id: string } }).data.id
}

async function signIn(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor', 'admin'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

async function publishPage(
  base: string,
  token: string,
  values: Readonly<Record<string, unknown>>,
  blocks: Readonly<Record<string, unknown>>,
): Promise<string> {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ values, blocks }),
    })
  ).json()) as { data: { id: string } }
  const published = await fetch(`${base}/api/content/page/${created.data.id}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  if (published.status !== 200) {
    throw new Error(`publish failed: ${published.status} ${await published.text()}`)
  }
  return created.data.id
}

async function deleteMedia(base: string, token: string, id: string): Promise<void> {
  const response = await fetch(`${base}/api/media/${id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  if (response.status !== 200 && response.status !== 204) {
    throw new Error(`delete failed: ${response.status} ${await response.text()}`)
  }
}

describe('cogenta serve — a page pointing at media that was deleted', () => {
  it('still serves the gallery pictures that are left after one of them is deleted', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const [first, second, third] = await Promise.all([
        upload(server.base, token, 'First shot'),
        upload(server.base, token, 'Second shot'),
        upload(server.base, token, 'Third shot'),
      ])

      await publishPage(
        server.base,
        token,
        { title: 'A gallery', slug: 'a-gallery' },
        {
          body: [
            {
              key: 'gallery-1',
              type: 'gallery',
              data: {
                layout: 'grid',
                items: [
                  { _key: 'i1', media: first },
                  { _key: 'i2', media: second },
                  { _key: 'i3', media: third },
                ],
              },
            },
          ],
        },
      )

      const before = await fetch(`${server.base}/a-gallery`)
      expect(before.status).toBe(200)
      expect(await before.text()).toContain(second)

      await deleteMedia(server.base, token, second)

      const after = await fetch(`${server.base}/a-gallery`)
      expect(after.status).toBe(200)
      const html = await after.text()
      expect(html).toContain(first)
      expect(html).toContain(third)
      expect(html).not.toContain(second)
      // The block itself survives: two of its three pictures are still there.
      expect(html).toContain('data-block-key="gallery-1"')
    } finally {
      await server.stop()
    }
  }, 60_000)

  /**
   * The same repair, on the other door into the renderer.
   *
   * `POST /api/builder/render` is what the page builder's preview calls, and
   * the audit found it answering 500 on a dead media reference — every
   * healthy block on the page vanishing with it, the error banner showing
   * `THEME_IMAGE_UNSUPPORTED` in English. It funnels into the same
   * `renderEntryPage` the public URL does (L16's "the preview is the real
   * render, never a second implementation"), so pruning covers both — but
   * that is an inference until something exercises this path, and nothing
   * did.
   */
  it('renders the builder preview of a page whose media was deleted, rather than failing it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const doomed = await upload(server.base, token, 'A doomed picture')
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            values: { title: 'In the builder', slug: 'in-the-builder' },
            blocks: {
              body: [
                {
                  key: 'figure-1',
                  type: 'mediaFigure',
                  data: { media: doomed, caption: 'Doomed' },
                },
                { key: 'prose-1', type: 'prose', data: { body: paragraph('The draft survives.') } },
              ],
            },
          }),
        })
      ).json()) as { data: { id: string } }

      await deleteMedia(server.base, token, doomed)

      const preview = await fetch(`${server.base}/api/builder/render`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          collection: 'page',
          entryId: created.data.id,
          blocks: {
            body: [
              { key: 'figure-1', type: 'mediaFigure', data: { media: doomed, caption: 'Doomed' } },
              { key: 'prose-1', type: 'prose', data: { body: paragraph('The draft survives.') } },
            ],
          },
        }),
      })

      expect(preview.status).toBe(200)
      const html = JSON.stringify(await preview.json())
      expect(html).toContain('The draft survives.')
      expect(html).not.toContain('THEME_IMAGE_UNSUPPORTED')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('drops a figure that has nothing left to show, and serves the rest of the page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const doomed = await upload(server.base, token, 'A doomed picture')

      await publishPage(
        server.base,
        token,
        { title: 'A figure', slug: 'a-figure', cover: doomed },
        {
          body: [
            {
              key: 'figure-1',
              type: 'mediaFigure',
              data: { media: doomed, caption: 'A doomed picture' },
            },
            { key: 'prose-1', type: 'prose', data: { body: paragraph('The text survives.') } },
          ],
        },
      )

      const before = await fetch(`${server.base}/a-figure`)
      expect(before.status).toBe(200)
      expect(await before.text()).toContain('data-block-key="figure-1"')

      await deleteMedia(server.base, token, doomed)

      const after = await fetch(`${server.base}/a-figure`)
      expect(after.status).toBe(200)
      const html = await after.text()
      expect(html).not.toContain('data-block-key="figure-1"')
      expect(html).not.toContain(doomed)
      expect(html).toContain('The text survives.')
      // The page's own cover field pointed at it too, and an `og:image` built
      // from a deleted asset would be a broken share card.
      expect(html).not.toContain('og:image')
    } finally {
      await server.stop()
    }
  }, 60_000)
})

function paragraph(text: string): readonly Readonly<Record<string, unknown>>[] {
  return [
    {
      _key: 'p1',
      _type: 'block',
      style: 'normal',
      children: [{ _key: 's1', _type: 'span', text, marks: [] }],
      markDefs: [],
    },
  ]
}
