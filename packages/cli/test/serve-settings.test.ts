import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Against a real server: the editorial site settings a rédacteur can change
 * without a terminal (fiche 23, ADR-0025's third category).
 *
 * Two acceptance criteria from the fiche get a real, end-to-end proof here
 * rather than a router-level assertion: "un rédacteur change … la page
 * d'accueil sans terminal" (changing the homepage setting really changes
 * what `GET /` serves, with no restart in between) and "toute écriture
 * produit une entrée d'audit" (a write actually lands in the hash-chained
 * log a real server keeps).
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
    permissions: {
      read: ['public'],
      create: ['editor', 'admin'],
      update: ['editor', 'admin'],
      publish: ['editor', 'admin'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-settings-'))
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

async function adminToken(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

async function editorToken(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

interface SerialisedSetting {
  readonly key: string
  readonly value: unknown
}

async function createPublishedPage(
  base: string,
  token: string,
  title: string,
  slug: string,
): Promise<void> {
  const created = await fetch(`${base}/api/content/page`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ values: { title, slug } }),
  })
  expect(created.status).toBe(201)
  const body = (await created.json()) as { data: { id: string } }
  const published = await fetch(`${base}/api/content/page/${body.data.id}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  expect(published.status).toBe(200)
}

describe('cogenta serve — /api/settings', () => {
  it('is readable anonymously and lists every registered setting', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/settings`)
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: readonly SerialisedSetting[] }
      expect(body.data.some((setting) => setting.key === 'general.title')).toBe(true)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses an editor writing a setting, and an anonymous caller too', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorToken(root, server.base)

      const asEditor = await fetch(`${server.base}/api/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'general.title', value: 'Hacked' }),
      })
      expect(asEditor.status).toBe(403)

      const asAnonymous = await fetch(`${server.base}/api/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'general.title', value: 'Hacked' }),
      })
      expect(asAnonymous.status).toBe(403)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('lets an admin write a setting, and every write lands in the audit log', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const written = await fetch(`${server.base}/api/settings`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ key: 'general.title', value: 'My Real Site' }),
      })
      expect(written.status).toBe(200)

      const audit = await fetch(`${server.base}/api/audit?action=site_setting.update`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(audit.status).toBe(200)
      const auditBody = (await audit.json()) as {
        data: readonly {
          readonly action: string
          readonly diff: { readonly key?: string } | null
        }[]
      }
      expect(auditBody.data.length).toBeGreaterThan(0)
      expect(auditBody.data[0]?.diff?.key).toBe('general.title')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses a key outside the registry', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'not.a.real.setting', value: 'x' }),
      })
      expect(response.status).toBe(404)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('SITE_SETTING_UNKNOWN')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('changes the page served at / without a restart, once the homepage setting is written (fiche 23 task 4)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createPublishedPage(server.base, token, 'Home', 'home')
      await createPublishedPage(server.base, token, 'Welcome', 'welcome')

      // Before any setting is written: the pre-existing fallback still works.
      const beforeRoot = await fetch(`${server.base}/`)
      expect(beforeRoot.status).toBe(200)
      expect(await beforeRoot.text()).toContain('Home')

      const patched = await fetch(`${server.base}/api/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'reading.homePath', value: '/welcome' }),
      })
      expect(patched.status).toBe(200)

      const afterRoot = await fetch(`${server.base}/`)
      expect(afterRoot.status).toBe(200)
      expect(await afterRoot.text()).toContain('Welcome')
    } finally {
      await server.stop()
    }
  }, 60_000)
})
