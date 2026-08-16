import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Against a real server: the admin screens the redirect table, the security
 * configuration and the webhook configuration never had (audit follow-up to
 * L10 tasks 2/6 and L14 task 1).
 *
 * `/api/redirects` is the only one of the three with a write path — the
 * other two are asserted read-only by construction, not merely by omission
 * of a `POST` handler (see `ops-status-router.ts`).
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
  },
]

async function project(security?: string, webhooks?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-redirects-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
${security === undefined ? '' : `  security: ${security},\n`}${
  webhooks === undefined ? '' : `  webhooks: ${webhooks},\n`
}}
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

async function adminToken(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

describe('cogenta serve — /api/redirects', () => {
  it('lets an admin create, list and remove a redirect over a real server', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = await fetch(`${server.base}/api/redirects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ from: '/old-page', to: '/new-page' }),
      })
      expect(created.status).toBe(201)

      const listed = await fetch(`${server.base}/api/redirects`, { headers })
      expect(listed.status).toBe(200)
      const listedBody = (await listed.json()) as { data: readonly { from: string }[] }
      expect(listedBody.data.map((row) => row.from)).toEqual(['/old-page'])

      const removed = await fetch(
        `${server.base}/api/redirects?from=${encodeURIComponent('/old-page')}`,
        { method: 'DELETE', headers },
      )
      expect(removed.status).toBe(204)

      const listedAfter = await fetch(`${server.base}/api/redirects`, { headers })
      const afterBody = (await listedAfter.json()) as { data: readonly unknown[] }
      expect(afterBody.data).toHaveLength(0)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses an anonymous caller, and an editor, with 403', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const anonymous = await fetch(`${server.base}/api/redirects`)
      expect(anonymous.status).toBe(403)
      await anonymous.arrayBuffer()

      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const asEditor = await fetch(`${server.base}/api/redirects`, {
        headers: { authorization: `Bearer ${editorToken}` },
      })
      expect(asEditor.status).toBe(403)
      await asEditor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('turns a real page rename into a working 301 for a visitor (proves the same table both screens see)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      await fetch(`${server.base}/api/redirects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ from: '/renamed', to: '/a-page' }),
      })

      // The `page` collection only grants `create`/`publish` to `editor` — an
      // admin manages redirects, an editor manages content, both real roles.
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const editorHeaders = {
        'content-type': 'application/json',
        authorization: `Bearer ${editorToken}`,
      }

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers: editorHeaders,
          body: JSON.stringify({ values: { title: 'A page', slug: 'a-page' } }),
        })
      ).json()) as { data: { id: string } }
      await fetch(`${server.base}/api/content/page/${created.data.id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${editorToken}` },
      })

      const visitor = await fetch(`${server.base}/renamed`, { redirect: 'manual' })
      expect(visitor.status).toBe(301)
      expect(visitor.headers.get('location')).toBe('/a-page')
      await visitor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('rejects a self-redirect as a 409, not a 500', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/redirects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ from: '/loop', to: '/loop' }),
      })
      expect(response.status).toBe(409)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('CONTENT_REDIRECT_LOOP')
    } finally {
      await server.stop()
    }
  }, 60_000)
})

describe('cogenta serve — /api/security-status and /api/webhooks-status', () => {
  it('mirrors the configuration file, admin-only, and never edits it', async () => {
    const root = await project(
      `{ csp: "default-src 'self'", hstsMaxAge: 3600, pageMaxAge: 120 }`,
      `{ endpoints: ['https://receiver.example/webhook'] }`,
    )
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const headers = { authorization: `Bearer ${token}` }

      const security = await fetch(`${server.base}/api/security-status`, { headers })
      expect(security.status).toBe(200)
      const securityBody = (await security.json()) as {
        data: { csp: string; hsts: { enabled: boolean; maxAge: number }; pageMaxAge: number }
      }
      expect(securityBody.data.csp).toBe("default-src 'self'")
      expect(securityBody.data.hsts).toEqual({
        enabled: true,
        maxAge: 3600,
        includeSubDomains: true,
      })
      expect(securityBody.data.pageMaxAge).toBe(120)

      const webhooks = await fetch(`${server.base}/api/webhooks-status`, { headers })
      expect(webhooks.status).toBe(200)
      const webhooksBody = (await webhooks.json()) as {
        data: { endpoints: readonly string[]; signed: boolean; disabledForMissingSecret: boolean }
      }
      expect(webhooksBody.data.endpoints).toEqual(['https://receiver.example/webhook'])
      // No COGENTA_WEBHOOK_SECRET is set in this test's environment, so the
      // configured endpoint is real but nothing is actually sent to it.
      expect(webhooksBody.data.signed).toBe(false)
      expect(webhooksBody.data.disabledForMissingSecret).toBe(true)

      // Read-only: there is no POST handler on either route.
      const attempt = await fetch(`${server.base}/api/security-status`, {
        method: 'POST',
        headers,
      })
      expect(attempt.status).toBe(405)
      await attempt.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses a non-admin caller on both routes', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const anonymousSecurity = await fetch(`${server.base}/api/security-status`)
      expect(anonymousSecurity.status).toBe(403)
      await anonymousSecurity.arrayBuffer()

      const anonymousWebhooks = await fetch(`${server.base}/api/webhooks-status`)
      expect(anonymousWebhooks.status).toBe(403)
      await anonymousWebhooks.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})
