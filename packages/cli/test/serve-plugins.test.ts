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
  capabilities: ['storage.write:plugins/watcher', 'content.write_draft:article', 'schema.read'],
  provides: {
    eventSubscriptions: ['content.publish'],
    routes: ['/hello', '/echo'],
    schedules: [{ name: 'sweep', everyMinutes: 60 }],
  },
  runtime: 'server',
  isolated: true,
}
`

const CODE = `({
  onDraft: async (input) => {
    const model = await sdk.schema.read({})
    const article = model.find((collection) => collection.name === 'article')
    const draft = await sdk.content.write_draft({
      collection: 'article',
      values: { title: input.title, slug: input.slug },
    })
    return { draft, fields: article.fields.map((field) => field.name) }
  },
  onSchedule: async (input) => {
    // Nothing granted: the method is absent from the SDK, so there is
    // simply nothing to write — the task still reports what it did.
    if (!sdk.content || !sdk.content.write_draft) return 'swept ' + input.name
    const written = await sdk.content.write_draft({
      collection: 'article',
      values: { title: 'A plugin draft', slug: 'a-plugin-draft' },
    })
    return 'swept ' + input.name + ' (' + written.status + ')'
  },
  onRequest: (request) => {
    if (request.path === '/echo') {
      return { status: 201, contentType: 'application/json', body: request.body }
    }
    if (request.query.crash === 'yes') {
      throw new Error('deliberate failure')
    }
    if (request.query.sneaky === 'yes') {
      return { status: 200, contentType: 'text/plain', body: 'x', headers: { 'set-cookie': 'a=b' } }
    }
    return { status: 200, contentType: 'text/html', body: '<p>Hello ' + (request.query.name || '') + '</p>' }
  },
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

describe('a plugin serving its own route', () => {
  it('answers under its reserved prefix, and nowhere else', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const hello = await fetch(`${server.base}/_cogenta/plugins/watcher/hello?name=Ada`)
      expect(hello.status).toBe(200)
      expect(hello.headers.get('content-type')).toContain('text/html')
      expect(hello.headers.get('cache-control')).toBe('no-store')
      expect(await hello.text()).toBe('<p>Hello Ada</p>')

      // A path the manifest never declared is a plain 404, like any unknown URL.
      const undeclared = await fetch(`${server.base}/_cogenta/plugins/watcher/secret`)
      expect(undeclared.status).toBe(404)
      // And the prefix is the plugin's own: nothing else of the site moved.
      expect((await fetch(`${server.base}/_cogenta/plugins/other/hello`)).status).toBe(404)
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('receives a POST body, and cannot set a header of its own', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const echo = await fetch(`${server.base}/_cogenta/plugins/watcher/echo`, {
        method: 'POST',
        body: '{"from":"a form"}',
      })
      expect(echo.status).toBe(201)
      expect(await echo.text()).toBe('{"from":"a form"}')

      // A plugin that tries to set a cookie on this origin sets nothing: the
      // host serves the status, the content type and the body, and no header
      // the plugin chose.
      const sneaky = await fetch(`${server.base}/_cogenta/plugins/watcher/hello?sneaky=yes`)
      expect(sneaky.status).toBe(200)
      expect(sneaky.headers.get('set-cookie')).toBeNull()
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('answers 500 when the plugin throws, without leaking its error', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const crashed = await fetch(`${server.base}/_cogenta/plugins/watcher/hello?crash=yes`)

      expect(crashed.status).toBe(500)
      expect(await crashed.text()).not.toContain('deliberate failure')
    } finally {
      await server.stop()
    }
  }, 120_000)
})

describe('a plugin’s scheduled work', () => {
  it('appears on the site’s own scheduled tasks, and runs there', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')
      const listed = await fetch(`${server.base}/api/scheduled-tasks`, { headers: auth(token) })
      expect(listed.status).toBe(200)
      const tasks = ((await listed.json()) as { data: { tasks: { name: string }[] } }).data.tasks
      expect(tasks.map((task) => task.name)).toContain('plugin:watcher:sweep')

      const ran = await fetch(`${server.base}/api/scheduled-tasks/plugin:watcher:sweep/run`, {
        method: 'POST',
        headers: auth(token),
      })
      expect(ran.status).toBe(200)
      const run = (await ran.json()) as { data: { outcome: string; summary: string | null } }
      expect(run.data.outcome).toBe('success')
      // Nothing was granted to this site's copy of the plugin, so the task
      // reports the work it could do and no more.
      expect(run.data.summary).toBe('swept sweep')
    } finally {
      await server.stop()
    }
  }, 120_000)
})

describe('a plugin writing content', () => {
  it('creates a draft a visitor cannot see, and never publishes it', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    await ensurePluginTables(db)
    const grants = createPluginGrantStore(db)
    await grants.grant('watcher', 'content.write_draft:article')
    await grants.grant('watcher', 'schema.read')
    await db.close()

    const server = await startServer(root, { registry: activeServers })
    try {
      // Run it through the route, which is the only way in from outside.
      const answer = await fetch(`${server.base}/_cogenta/plugins/watcher/echo`, {
        method: 'POST',
        body: '{"from":"a form"}',
      })
      expect(answer.status).toBe(201)

      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')
      const before = await fetch(`${server.base}/api/content/article`, { headers: auth(token) })
      expect(before.status).toBe(200)
      const countBefore = ((await before.json()) as { data: unknown[] }).data.length

      // The plugin's own draft, written from its scheduled task.
      const ran = await fetch(`${server.base}/api/scheduled-tasks/plugin:watcher:sweep/run`, {
        method: 'POST',
        headers: auth(token),
      })
      expect(ran.status).toBe(200)

      const listed = await fetch(`${server.base}/api/content/article?state=working`, {
        headers: auth(token),
      })
      const items = (
        (await listed.json()) as {
          data: { status: string; title?: string; values?: { title?: string } }[]
        }
      ).data.map((item) => ({ ...item, title: item.values?.title ?? item.title }))
      // At least one more than before: the site's scheduler may legitimately
      // have run this task once already, the moment it found it due.
      expect(items.length).toBeGreaterThan(countBefore)
      expect(items.some((item) => item.title === 'A plugin draft')).toBe(true)
      // Written, and invisible: a plugin drafts, a human publishes.
      expect(items.some((item) => item.status === 'published')).toBe(false)
      expect((await fetch(`${server.base}/blog/a-plugin-draft`)).status).toBe(404)
    } finally {
      await server.stop()
    }
  }, 120_000)
})
