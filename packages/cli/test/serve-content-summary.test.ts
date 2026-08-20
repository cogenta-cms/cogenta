import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * End to end: fiche 22 tâche 1's dashboard content summary widget, against a
 * real `cogenta serve` process and real content actually written to the
 * database — the DoD's own requirement ("les chiffres du tableau de bord
 * correspondent au contenu réel en base"), not a unit test standing in for
 * it.
 */

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-summary-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Summary test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `import { defineCollection, f } from '@cogenta/schema'

export default [
  defineCollection({
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: { title: f.text({ required: true, max: 200 }) },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
      publish: ['editor'],
    },
  }),
]
`,
    'utf8',
  )
  return root
}

async function startServer(root: string): Promise<{ base: string; stop: () => Promise<void> }> {
  const controller = new AbortController()
  activeServers.push(controller)

  let resolveAddress: (value: { port: number; host: string }) => void
  const address = new Promise<{ port: number; host: string }>((resolve) => {
    resolveAddress = resolve
  })

  const done = runServe({
    cwd: root,
    env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
    logger: createLogger({ level: 'silent' }),
    out: createOutput(() => undefined, false),
    stderr: () => undefined,
    port: 0,
    signal: controller.signal,
    onListening: (a) => resolveAddress(a),
  })
  const bound = await Promise.race([
    address,
    done.then((code) => {
      throw new Error(`runServe exited with code ${code} before it started listening`)
    }),
  ])
  return {
    base: `http://${bound.host}:${bound.port}`,
    stop: async () => {
      controller.abort()
      await done
    },
  }
}

async function login(
  root: string,
  base: string,
  email: string,
  roles: readonly string[],
): Promise<string> {
  const { createSqliteHandle } = await import('@cogenta/core')
  const { createUserStore, createCredentialStore, ensureAuthTables } = await import('@cogenta/auth')
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureAuthTables(db)
  const users = createUserStore(db)
  const credentials = createCredentialStore(db)
  const user = await users.create({ email, roles })
  await credentials.setPassword(user.id, 'correct horse battery staple')
  await db.close()

  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery staple' }),
  })
  const body = (await response.json()) as { data: { session?: { token: string } } }
  const token = body.data.session?.token
  if (token === undefined) throw new Error('expected a session token')
  return token
}

describe('content summary — end to end through a real server', () => {
  it('reports counts that match content really written to the database', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const admin = await login(root, server.base, 'admin@example.com', ['admin'])
      const editor = await login(root, server.base, 'editor@example.com', ['editor'])

      const create = async (title: string): Promise<string> => {
        const response = await fetch(`${server.base}/api/content/article`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${editor}` },
          body: JSON.stringify({ values: { title } }),
        })
        const created = (await response.json()) as { data: { id: string } }
        return created.data.id
      }

      const draft1 = await create('Draft one')
      await create('Draft two')
      const toPublish = await create('Will publish')
      await fetch(`${server.base}/api/content/article/${toPublish}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${editor}` },
      })
      const toTrash = await create('Will be trashed')
      // `delete` is `admin`-only on this collection — the editor token
      // could not trash it even if this test tried.
      const trashResponse = await fetch(`${server.base}/api/content/article/${toTrash}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${admin}` },
      })
      expect(trashResponse.status).toBe(204)

      // The editor role grants `create`/`update`/`publish` on this
      // collection but not `delete` — so it may read the drafts, and must
      // not learn the trash count.
      const asEditor = await fetch(`${server.base}/api/content/-/summary`, {
        headers: { authorization: `Bearer ${editor}` },
      })
      expect(asEditor.status).toBe(200)
      const editorBody = (await asEditor.json()) as {
        data: readonly { collection: string; draft: number | null; trashed: number | null }[]
      }
      const editorRow = editorBody.data.find((row) => row.collection === 'article')
      expect(editorRow?.draft).toBe(2)
      expect(editorRow?.trashed).toBeNull()

      // The admin role grants `delete` here, so it sees the trash count too.
      const asAdmin = await fetch(`${server.base}/api/content/-/summary`, {
        headers: { authorization: `Bearer ${admin}` },
      })
      const adminBody = (await asAdmin.json()) as {
        data: readonly {
          collection: string
          total: number
          published: number
          draft: number | null
          trashed: number | null
        }[]
      }
      const adminRow = adminBody.data.find((row) => row.collection === 'article')
      expect(adminRow).toMatchObject({ total: 3, published: 1, draft: 2, trashed: 1 })

      // Not an approximation: the count and the real per-collection list
      // agree on the same number of live drafts, draft1 among them.
      const list = await fetch(`${server.base}/api/content/article?state=working&status=draft`, {
        headers: { authorization: `Bearer ${editor}` },
      })
      const listBody = (await list.json()) as { data: readonly { id: string }[] }
      expect(listBody.data).toHaveLength(2)
      expect(listBody.data.map((entry) => entry.id)).toContain(draft1)
    } finally {
      await server.stop()
    }
  })
})
