import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L10 task 3, end to end: content written over the real API becomes findable
 * over the real search route, with the real permission rules in between.
 *
 * Everything here goes over HTTP against a `cogenta serve` on a real SQLite
 * database. Nothing writes to the store directly, on purpose — the whole
 * point of the task is that the index is kept in step by the write path
 * itself, so a test that seeded around it would prove nothing.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    versioning: { drafts: true, history: true },
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
  {
    name: 'memo',
    labels: { singular: 'Memo', plural: 'Memos' },
    fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
    permissions: {
      read: ['editor', 'admin'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-search-e2e-'))
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

interface Created {
  readonly id: string
}

async function create(
  base: string,
  token: string,
  collection: string,
  values: Readonly<Record<string, string>>,
): Promise<string> {
  const response = await fetch(`${base}/api/content/${collection}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ values }),
  })
  if (response.status !== 201) throw new Error(`create failed: ${response.status}`)
  return ((await response.json()) as { data: Created }).data.id
}

async function publish(base: string, token: string, collection: string, id: string): Promise<void> {
  const response = await fetch(`${base}/api/content/${collection}/${id}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  if (response.status !== 200) throw new Error(`publish failed: ${response.status}`)
}

interface SearchBody {
  readonly data: readonly { readonly id: string; readonly collection: string }[]
}

async function search(
  base: string,
  query: string,
  token?: string,
): Promise<{ status: number; ids: readonly string[]; collections: readonly string[] }> {
  const response = await fetch(`${base}/api/search?${query}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  })
  if (response.status !== 200) return { status: response.status, ids: [], collections: [] }
  const body = (await response.json()) as SearchBody
  return {
    status: response.status,
    ids: body.data.map((hit) => hit.id),
    collections: body.data.map((hit) => hit.collection),
  }
}

describe('cogenta serve — GET /api/search (L10 task 3)', () => {
  it('content created and published over the API becomes findable, drafts do not', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )

      const live = await create(server.base, token, 'page', {
        title: 'Cathedral windows',
        slug: 'cathedral-windows',
      })
      await publish(server.base, token, 'page', live)
      const draft = await create(server.base, token, 'page', {
        title: 'Cathedral crypt',
        slug: 'cathedral-crypt',
      })

      const anonymous = await search(server.base, 'q=cathedral')
      expect(anonymous.ids).toEqual([live])

      const asEditor = await search(server.base, 'q=cathedral&status=draft', token)
      expect(asEditor.ids).toEqual([draft])
    } finally {
      await server.stop()
    }
  })

  it('never returns a collection the caller may not read', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )

      const memo = await create(server.base, token, 'memo', { title: 'Cathedral budget' })
      await publish(server.base, token, 'memo', memo)

      expect((await search(server.base, 'q=cathedral')).collections).toEqual([])
      expect((await search(server.base, 'q=cathedral', token)).collections).toEqual(['memo'])

      // Naming it explicitly is an honest refusal, not a quieter answer.
      const named = await fetch(`${server.base}/api/search?q=cathedral&collections=memo`)
      expect(named.status).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('an entry deleted over the API stops being findable', async () => {
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

      const id = await create(server.base, token, 'page', {
        title: 'Transient notice',
        slug: 'transient-notice',
      })
      await publish(server.base, token, 'page', id)
      expect((await search(server.base, 'q=transient')).ids).toEqual([id])

      const deleted = await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(deleted.status).toBe(204)
      expect((await search(server.base, 'q=transient')).ids).toEqual([])
    } finally {
      await server.stop()
    }
  })

  it('serves a public search page with a working form and real links', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const id = await create(server.base, token, 'page', {
        title: 'Cathedral windows',
        slug: 'cathedral-windows',
      })
      await publish(server.base, token, 'page', id)

      const empty = await fetch(`${server.base}/search`)
      expect(empty.status).toBe(200)
      const emptyHtml = await empty.text()
      expect(emptyHtml).toContain('role="search"')
      expect(emptyHtml).toContain('name="q"')

      const results = await fetch(`${server.base}/search?q=cathedral`)
      const html = await results.text()
      expect(html).toContain('href="/cathedral-windows"')
      expect(html).toContain('Cathedral windows')
      // A search results page is exactly what a crawler must not index.
      expect(html).toContain('<meta name="robots" content="noindex, follow" />')
    } finally {
      await server.stop()
    }
  })
})
