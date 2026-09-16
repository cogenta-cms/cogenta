import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle } from '@cogenta/core'
import { createPluginGrantStore, ensurePluginTables } from '@cogenta/plugins'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L31 step 2, end to end on a real server: publishing an entry over HTTP
 * reaches a plugin installed in `plugins/`, inside the isolated worker, with
 * the capability it was really granted.
 *
 * This is the thing `BLOCKERS.md` §14 said did not exist — "rien dans ce
 * dépôt n'appelle `runPlugin`". Only this layer can prove it: a unit test
 * calling `dispatchContentEvent` would prove the dispatcher works, not that a
 * real publish ever reaches it.
 */

const MANIFEST = `export default {
  name: 'watcher',
  version: '1.0.0',
  engine: '^1.0.0',
  capabilities: ['storage.write:plugins/watcher'],
  provides: { eventSubscriptions: ['content.publish'] },
  runtime: 'server',
  isolated: true,
}
`

const CODE = `({
  onContentEvent: async (event) => {
    await sdk.storage.write({
      key: 'plugins/watcher/last-event.json',
      content: JSON.stringify({ event: event.event, collection: event.collection, id: event.id }),
    })
    return { seen: event.event }
  },
})`

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function project(options: { readonly grant?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-plugins-e2e-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Plugin Site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/blog/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title', unique: true } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['admin'],
    },
  },
]
`,
    'utf8',
  )

  const pluginDir = join(root, 'plugins', 'watcher')
  await mkdir(pluginDir, { recursive: true })
  await writeFile(join(pluginDir, 'plugin.manifest.mjs'), MANIFEST, 'utf8')
  await writeFile(join(pluginDir, 'plugin.js'), CODE, 'utf8')

  if (options.grant === true) {
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    await ensurePluginTables(db)
    await createPluginGrantStore(db).grant('watcher', 'storage.write:plugins/watcher')
    await db.close()
  }
  return root
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function publishOne(base: string, token: string, title: string): Promise<string> {
  const created = await fetch(`${base}/api/content/article`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      values: { title, slug: title.toLowerCase().replaceAll(' ', '-') },
    }),
  })
  expect(created.status).toBe(201)
  const id = ((await created.json()) as { data: { id: string } }).data.id
  const published = await fetch(`${base}/api/content/article/${id}/publish`, {
    method: 'POST',
    headers: auth(token),
  })
  expect(published.status).toBe(200)
  return id
}

/** What the plugin wrote, wherever the local storage driver laid it down. */
async function writtenEvent(root: string): Promise<Record<string, unknown> | null> {
  const found: string[] = []
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.name.startsWith('last-event')) found.push(path)
    }
  }
  await walk(join(root, 'media'))
  const path = found[0]
  if (path === undefined) return null
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
}

describe('a plugin on a running site', () => {
  it('receives the content event a real publish emits, and acts on it', async () => {
    const root = await project({ grant: true })
    await createUser(root, 'editor@example.com', 'sup3r-secret-pass', ['editor'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'editor@example.com', 'sup3r-secret-pass')
      const id = await publishOne(server.base, token, 'A published article')

      const written = await writtenEvent(root)
      expect(written).not.toBeNull()
      expect(written?.['event']).toBe('content.publish')
      expect(written?.['collection']).toBe('article')
      expect(written?.['id']).toBe(id)
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('publishes normally when the plugin was granted nothing, and writes nothing', async () => {
    const root = await project()
    await createUser(root, 'editor@example.com', 'sup3r-secret-pass', ['editor'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'editor@example.com', 'sup3r-secret-pass')
      // The plugin throws inside the sandbox (`sdk.storage` is absent, not
      // refused) — and the editor's publish still succeeds.
      await publishOne(server.base, token, 'Another article')

      expect(await writtenEvent(root)).toBeNull()
    } finally {
      await server.stop()
    }
  }, 120_000)
})
