import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { makePng } from './helpers/png.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Fiche 04 (rich text editor), tasks 2-3, against a real server: a `media`
 * node and an `internalLink` mark living *inside* a `richText` document
 * (ADR-0013) are not reachable through `@cogenta/api`'s `collectDependencies`
 * — it only walks a collection's own declared fields — so before
 * `theme-render.ts`'s `collectRichTextAssets` this would either throw
 * (`ctx.image()` on an asset never loaded) or resolve to a dead `#` anchor
 * (`ctx.link()` on an entry never fetched).
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/blog/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      body: { kind: 'richText', options: {} },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
  },
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
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
  const root = await mkdtemp(join(tmpdir(), 'cogenta-rich-text-'))
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

async function editorToken(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

interface Entry {
  readonly id: string
}

describe('cogenta serve — rich text (fiche 04)', () => {
  it('renders a real srcset for an image node placed inside a paragraph', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const upload = await fetch(`${server.base}/api/media`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind: 'image',
          filename: 'gradient.png',
          mimeType: 'image/png',
          data: makePng(1000, 500).toString('base64'),
          alt: 'A wide gradient',
        }),
      })
      expect(upload.status).toBe(201)
      const asset = ((await upload.json()) as { data: { id: string } }).data

      const created = (await (
        await fetch(`${server.base}/api/content/article`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            values: {
              title: 'Illustrated article',
              slug: 'illustrated-article',
              body: [
                {
                  _key: 'b1',
                  _type: 'block',
                  style: 'normal',
                  children: [{ _key: 's1', _type: 'span', text: 'Before the picture.', marks: [] }],
                  markDefs: [],
                },
                { _key: 'm1', _type: 'media', id: asset.id, caption: 'Mid-article' },
                {
                  _key: 'b2',
                  _type: 'block',
                  style: 'normal',
                  children: [{ _key: 's2', _type: 'span', text: 'After the picture.', marks: [] }],
                  markDefs: [],
                },
              ],
            },
          }),
        })
      ).json()) as { data: Entry }
      await fetch(`${server.base}/api/content/article/${created.data.id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      const html = await (await fetch(`${server.base}/blog/illustrated-article`)).text()

      expect(html).toContain('Before the picture.')
      expect(html).toContain('After the picture.')
      expect(html).toContain('srcset=')
      expect(html).toContain(`/_image?id=${asset.id}`)
      expect(html).toContain('alt="A wide gradient"')
      expect(html).toContain('Mid-article')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('resolves an internal link by id, surviving a rename of the target slug', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const target = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'Target', slug: 'target-a' } }),
        })
      ).json()) as { data: Entry }
      await fetch(`${server.base}/api/content/page/${target.data.id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      const article = (await (
        await fetch(`${server.base}/api/content/article`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            values: {
              title: 'Linking article',
              slug: 'linking-article',
              body: [
                {
                  _key: 'b1',
                  _type: 'block',
                  style: 'normal',
                  children: [{ _key: 's1', _type: 'span', text: 'See the target.', marks: ['m1'] }],
                  markDefs: [
                    { _key: 'm1', _type: 'internalLink', collection: 'page', id: target.data.id },
                  ],
                },
              ],
            },
          }),
        })
      ).json()) as { data: Entry }
      await fetch(`${server.base}/api/content/article/${article.data.id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      const before = await (await fetch(`${server.base}/blog/linking-article`)).text()
      expect(before).toContain('<a href="/target-a">See the target.</a>')

      // Renaming the target does not touch the article at all — the link is
      // stored as `{ collection, id }`, never a URL (ADR-0013).
      await fetch(`${server.base}/api/content/page/${target.data.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { slug: 'target-renamed' } }),
      })
      await fetch(`${server.base}/api/content/page/${target.data.id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      const after = await (await fetch(`${server.base}/blog/linking-article`)).text()
      expect(after).toContain('<a href="/target-renamed">See the target.</a>')
      expect(after).not.toContain('/target-a"')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('renders an internal link to a trashed entry as plain text, never a dead anchor', async () => {
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
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const target = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'Doomed', slug: 'doomed' } }),
        })
      ).json()) as { data: Entry }
      await fetch(`${server.base}/api/content/page/${target.data.id}/publish`, {
        method: 'POST',
        headers,
      })

      const article = (await (
        await fetch(`${server.base}/api/content/article`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            values: {
              title: 'Referencing article',
              slug: 'referencing-article',
              body: [
                {
                  _key: 'b1',
                  _type: 'block',
                  style: 'normal',
                  children: [
                    { _key: 's1', _type: 'span', text: 'The doomed page.', marks: ['m1'] },
                  ],
                  markDefs: [
                    { _key: 'm1', _type: 'internalLink', collection: 'page', id: target.data.id },
                  ],
                },
              ],
            },
          }),
        })
      ).json()) as { data: Entry }
      await fetch(`${server.base}/api/content/article/${article.data.id}/publish`, {
        method: 'POST',
        headers,
      })

      const before = await (await fetch(`${server.base}/blog/referencing-article`)).text()
      expect(before).toContain('<a href="/doomed">The doomed page.</a>')

      await fetch(`${server.base}/api/content/page/${target.data.id}`, {
        method: 'DELETE',
        headers,
      })

      const after = await (await fetch(`${server.base}/blog/referencing-article`)).text()
      expect(after).toContain('The doomed page.')
      expect(after).not.toContain('<a href="/doomed"')
      expect(after).not.toContain('href="#"')
    } finally {
      await server.stop()
    }
  }, 60_000)
})
