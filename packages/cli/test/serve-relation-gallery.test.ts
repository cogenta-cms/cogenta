import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { makePng } from './helpers/png.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Fiche 03's own "bout en bout" acceptance criterion (task 1's critère and
 * the fiche's "Tests exigés" section): "créer une entrée avec une relation
 * et une galerie de trois images contre un vrai serveur, relire, comparer."
 *
 * Real HTTP, a real SQLite file, a real session — proving what `RelationField`
 * and `MediaField` actually drive through `/api/content/*`, not a mock of it.
 * It doubles as the end-to-end proof for a real bug found and fixed while
 * building those two editors: `f.media({ many: true })` validated an array
 * at the API boundary (`@cogenta/schema`'s `validation.ts`) but then threw
 * trying to store it as a single string (`columnTypeFor`/`encodeFieldValue`)
 * — this test would have failed loudly against the old store.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'person',
    labels: { singular: 'Person', plural: 'People' },
    fields: {
      name: { kind: 'text', required: true, options: { max: 200 } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
    },
  },
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      author: { kind: 'relation', options: { to: 'person', onDelete: 'restrict' } },
      gallery: { kind: 'media', options: { accept: ['image'], many: true } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-relation-gallery-'))
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

interface Entry {
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
}

interface MediaAsset {
  readonly id: string
}

async function signIn(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

async function upload(base: string, token: string, filename: string): Promise<MediaAsset> {
  const response = await fetch(`${base}/api/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      kind: 'image',
      filename,
      mimeType: 'image/png',
      data: makePng(40, 40).toString('base64'),
      alt: `Gallery image ${filename}`,
    }),
  })
  if (response.status !== 201) {
    throw new Error(`upload failed: ${response.status} ${await response.text()}`)
  }
  return ((await response.json()) as { data: MediaAsset }).data
}

/**
 * Every call below adds `depth=0` — exactly what `@cogenta/admin`'s
 * `content-client.ts` now sends on every entry-returning request (a real
 * bug found while building this test: REST expands a `relation` field to
 * the related entry's whole document by default, and an admin form that
 * read that expanded object back into `values` and saved again would send
 * an object where the store expects a plain id string, refused with
 * `CONTENT_INVALID`). This test exercises the same shape the real admin
 * now requests, not a looser one.
 */
function withNoExpansion(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}depth=0`
}

async function post(
  base: string,
  token: string,
  path: string,
  body: unknown,
): Promise<{ readonly status: number; readonly data: Entry }> {
  const response = await fetch(`${base}${withNoExpansion(path)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: response.status, data: ((await response.json()) as { data: Entry }).data }
}

async function patch(
  base: string,
  token: string,
  path: string,
  body: unknown,
): Promise<{ readonly status: number; readonly data: Entry }> {
  const response = await fetch(`${base}${withNoExpansion(path)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: response.status, data: ((await response.json()) as { data: Entry }).data }
}

async function get(base: string, token: string, path: string): Promise<Entry> {
  // `state=working`: a `GET` with no `state` reads the *published* face
  // (`parseState`'s own default), and this test reads entries that were
  // never published — the same reason `content-client.ts`'s `getEntry`
  // always asks for `working` too.
  const response = await fetch(`${base}${withNoExpansion(path)}&state=working`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const body = (await response.json()) as { data?: Entry; error?: unknown }
  if (body.data === undefined) {
    throw new Error(`GET ${path} failed: ${response.status} ${JSON.stringify(body.error)}`)
  }
  return body.data
}

describe('cogenta serve — relation and gallery fields, end to end (fiche 03)', () => {
  it('creates an entry with a relation and a gallery of three images, and reads back the same shape', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)

      const author = await post(server.base, token, '/api/content/person', {
        values: { name: 'Colette' },
      })
      expect(author.status).toBe(201)

      const one = await upload(server.base, token, 'one.png')
      const two = await upload(server.base, token, 'two.png')
      const three = await upload(server.base, token, 'three.png')

      const created = await post(server.base, token, '/api/content/article', {
        values: {
          title: 'Sido',
          author: author.data.id,
          gallery: [one.id, two.id, three.id],
        },
      })
      expect(created.status).toBe(201)
      expect(created.data.values.author).toBe(author.data.id)
      expect(created.data.values.gallery).toEqual([one.id, two.id, three.id])

      // Read back over a fresh request — not just the create response — the
      // real proof that this round-tripped through the store rather than
      // being echoed straight back from the input.
      const reread = await get(server.base, token, `/api/content/article/${created.data.id}`)
      expect(reread.values.author).toBe(author.data.id)
      expect(reread.values.gallery).toEqual([one.id, two.id, three.id])

      // The reorder an `EntryPicker`/`MediaPicker` drag-and-drop or
      // move-button would produce: same three ids, new order.
      const reordered = await patch(server.base, token, `/api/content/article/${created.data.id}`, {
        values: { gallery: [three.id, one.id, two.id] },
      })
      expect(reordered.status).toBe(200)
      expect(reordered.data.values.gallery).toEqual([three.id, one.id, two.id])

      const rereadAfterReorder = await get(
        server.base,
        token,
        `/api/content/article/${created.data.id}`,
      )
      expect(rereadAfterReorder.values.gallery).toEqual([three.id, one.id, two.id])

      // `EntryEditRoute.submit()` resends every field's current value on
      // every save, not a diff of what changed — so a form that loaded this
      // entry, touched only `title`, and saved must still be able to send
      // `author` back exactly as it was read. This is the round trip that
      // would break if the read had come back expanded.
      const resaved = await patch(server.base, token, `/api/content/article/${created.data.id}`, {
        values: {
          title: 'Sido (revu)',
          author: rereadAfterReorder.values.author,
          gallery: rereadAfterReorder.values.gallery,
        },
      })
      expect(resaved.status).toBe(200)
      expect(resaved.data.values.title).toBe('Sido (revu)')
      expect(resaved.data.values.author).toBe(author.data.id)
      expect(resaved.data.values.gallery).toEqual([three.id, one.id, two.id])
    } finally {
      await server.stop()
    }
  })

  it('refuses to delete a relation target that is still referenced', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await signIn(root, server.base)
      const author = await post(server.base, token, '/api/content/person', {
        values: { name: 'Colette' },
      })
      await post(server.base, token, '/api/content/article', {
        values: { title: 'Sido', author: author.data.id },
      })

      const response = await fetch(`${server.base}/api/content/person/${author.data.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBeGreaterThanOrEqual(400)
    } finally {
      await server.stop()
    }
  })
})
