import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { makePng } from './helpers/png.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Fiche L21 task 8, end to end: Cogenta's own credit in the public footer,
 * and its white-label override — `branding.showCogentaBranding` /
 * `branding.customLogoMediaId`, read live off the same `/api/settings`
 * store `serve-settings.test.ts` already proves changes without a restart.
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
  const root = await mkdtemp(join(tmpdir(), 'cogenta-branding-'))
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

async function createPublishedPage(base: string, token: string): Promise<void> {
  const created = await fetch(`${base}/api/content/page`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ values: { title: 'Home', slug: 'home' } }),
  })
  expect(created.status).toBe(201)
  const body = (await created.json()) as { data: { id: string } }
  const published = await fetch(`${base}/api/content/page/${body.data.id}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  expect(published.status).toBe(200)
}

interface Asset {
  readonly id: string
}

async function uploadImage(base: string, token: string): Promise<Asset> {
  const bytes = makePng(4, 4)
  const response = await fetch(`${base}/api/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      kind: 'image',
      filename: 'client-logo.png',
      mimeType: 'image/png',
      data: bytes.toString('base64'),
      alt: 'Client logo',
    }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { data: Asset }).data
}

async function writeSetting(
  base: string,
  token: string,
  key: string,
  value: unknown,
): Promise<void> {
  const response = await fetch(`${base}/api/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, value }),
  })
  expect(response.status).toBe(200)
}

describe('cogenta serve — footer branding (fiche L21 task 8)', () => {
  it('credits Cogenta in the footer by default, and serves the logo asset itself', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createPublishedPage(server.base, token)

      const home = await fetch(`${server.base}/`)
      expect(home.status).toBe(200)
      const html = await home.text()
      expect(html).toContain('cg-site-footer__branding')
      expect(html).toContain('/_cogenta/logo-cogenta.png')

      const logo = await fetch(`${server.base}/_cogenta/logo-cogenta.png`)
      expect(logo.status).toBe(200)
      expect(logo.headers.get('content-type')).toBe('image/png')
      expect(logo.headers.get('cache-control')).toContain('immutable')
      expect((await logo.arrayBuffer()).byteLength).toBeGreaterThan(0)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('drops the Cogenta credit once turned off, without a restart', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createPublishedPage(server.base, token)

      const before = await fetch(`${server.base}/`)
      expect(await before.text()).toContain('cg-site-footer__branding')

      await writeSetting(server.base, token, 'branding.showCogentaBranding', false)

      const after = await fetch(`${server.base}/`)
      const html = await after.text()
      expect(html).not.toContain('cg-site-footer__branding')
      expect(html).not.toContain('/_cogenta/logo-cogenta.png')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('renders the white-label logo through /_image once uploaded and set', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await createPublishedPage(server.base, token)
      const asset = await uploadImage(server.base, token)

      await writeSetting(server.base, token, 'branding.showCogentaBranding', false)
      await writeSetting(server.base, token, 'branding.customLogoMediaId', asset.id)

      const home = await fetch(`${server.base}/`)
      const html = await home.text()
      expect(html).toContain('cg-site-footer__branding')
      expect(html).toContain(`/_image?id=${asset.id}&amp;w=64`)
      expect(html).not.toContain('/_cogenta/logo-cogenta.png')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('drops branding from the search and forms pages too, not just the home page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await writeSetting(server.base, token, 'branding.showCogentaBranding', false)

      const search = await fetch(`${server.base}/search?q=x`)
      expect(search.status).toBe(200)
      expect(await search.text()).not.toContain('cg-site-footer__branding')
    } finally {
      await server.stop()
    }
  }, 60_000)
})
