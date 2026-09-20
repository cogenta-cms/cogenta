import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * "Who changed the navigation?" — a question the audit log could not answer.
 *
 * Settings, media, API keys, role permissions and the admin template each
 * had their own recorder in `serve.ts`. Menus, widgets, redirects and the
 * active public theme had none, so the four writes that most visibly reshape
 * a site left no trace at all. Found by making one of each and comparing the
 * newest journal entry before and after (audit, 2026-09-19).
 *
 * Every assertion here reads the real `/api/audit` route, so what is proven
 * is what an administrator actually sees on the Audit screen.
 */

const activeServers: AbortController[] = []
afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-shape-audit-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Shape Site', url: 'https://example.com' },
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
      publish: ['editor'],
      delete: ['editor'],
    },
  },
]
`,
    'utf8',
  )
  return root
}

describe('the writes that reshape a site', () => {
  it('each leave an entry in the audit log, naming who made them', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')
      const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

      const menu = await fetch(`${server.base}/api/menus`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ name: 'header', locale: 'en', label: 'Header' }),
      })
      expect(menu.status).toBe(201)

      const widget = await fetch(`${server.base}/api/widgets`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ area: 'sidebar', type: 'search', title: 'Search' }),
      })
      expect(widget.status).toBe(201)

      const redirect = await fetch(`${server.base}/api/redirects`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ from: '/old', to: '/new', status: 301 }),
      })
      expect(redirect.status).toBe(201)

      const audit = (await (await fetch(`${server.base}/api/audit`, { headers: auth })).json()) as {
        data: { action: string; actorId: string | null; diff?: Record<string, unknown> }[]
      }
      const actions = audit.data.map((row) => row.action)

      expect(actions).toContain('menu.write')
      expect(actions).toContain('widget.write')
      expect(actions).toContain('redirect.write')

      // Not just "something happened": the entry names the actor, so the log
      // answers "who", which is the only reason to keep one.
      const menuEntry = audit.data.find((row) => row.action === 'menu.write')
      expect(menuEntry?.actorId).not.toBeNull()
      expect(menuEntry?.diff).toMatchObject({ method: 'POST', path: '/api/menus' })
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('records nothing for a read, and nothing for a write that was refused', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')
      const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

      const countShapeEntries = async (): Promise<number> => {
        const audit = (await (
          await fetch(`${server.base}/api/audit`, { headers: auth })
        ).json()) as { data: { action: string }[] }
        return audit.data.filter((row) => row.action.endsWith('.write')).length
      }

      const before = await countShapeEntries()

      await fetch(`${server.base}/api/menus`, { headers: auth })
      await fetch(`${server.base}/api/widgets`, { headers: auth })
      // A refused write: no `from`, so the router rejects it.
      const refused = await fetch(`${server.base}/api/redirects`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ to: '/new' }),
      })
      expect(refused.status).toBeGreaterThanOrEqual(400)

      expect(await countShapeEntries()).toBe(before)
    } finally {
      await server.stop()
    }
  }, 120_000)
})
