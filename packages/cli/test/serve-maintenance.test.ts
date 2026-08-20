import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Maintenance mode (fiche 24 task 5): a 503 with a wait page for every
 * anonymous visitor while it is on, `/api/*` and `/admin*` always reachable
 * so a signed-in admin can turn it back off, an already-authenticated actor
 * let straight through, and — the acceptance criterion this test exists
 * for — never cacheable.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-maintenance-'))
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
  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function adminToken(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

describe('cogenta serve — maintenance mode', () => {
  it('is off by default: a visitor is routed normally', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/`, { redirect: 'manual' })
      expect(response.status).not.toBe(503)
      await response.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('serves an uncacheable 503 with a wait page to an anonymous visitor once turned on', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const toggled = await fetch(`${server.base}/api/maintenance`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true, message: 'Testing maintenance.' }),
      })
      expect(toggled.status).toBe(200)

      const visitor = await fetch(`${server.base}/`, { redirect: 'manual' })
      expect(visitor.status).toBe(503)
      expect(visitor.headers.get('retry-after')).toBeTruthy()
      expect(visitor.headers.get('cache-control')).toBe('no-store')
      const html = await visitor.text()
      expect(html).toContain('Testing maintenance.')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('lets a signed-in actor through while it is on', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await fetch(`${server.base}/api/maintenance`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })

      const asAdmin = await fetch(`${server.base}/`, {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'manual',
      })
      expect(asAdmin.status).not.toBe(503)
      await asAdmin.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('keeps /admin and /api reachable for an anonymous caller while it is on', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await fetch(`${server.base}/api/maintenance`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })

      const admin = await fetch(`${server.base}/admin`, { redirect: 'manual' })
      expect(admin.status).not.toBe(503)
      await admin.arrayBuffer()

      // An anonymous read of the schema (a real, always-public API route)
      // must not 503 either — an admin who is not yet signed in still has
      // to be able to load the login screen and its supporting calls.
      const schema = await fetch(`${server.base}/api/schema`)
      expect(schema.status).not.toBe(503)
      await schema.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('turns back off and stops serving the wait page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
      await fetch(`${server.base}/api/maintenance`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: true }),
      })
      const on = await fetch(`${server.base}/`, { redirect: 'manual' })
      expect(on.status).toBe(503)
      await on.arrayBuffer()

      await fetch(`${server.base}/api/maintenance`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: false }),
      })
      const off = await fetch(`${server.base}/`, { redirect: 'manual' })
      expect(off.status).not.toBe(503)
      await off.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})
