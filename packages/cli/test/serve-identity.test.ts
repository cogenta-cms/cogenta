import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { makePng } from './helpers/png.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * The site identity — logo, dark logo, favicon, share image — end to end
 * (audit 2026-09-01 §7 T01).
 *
 * These four settings had been writable from the appearance screen, saved,
 * and read back by the admin since fiche 14, and read by *nothing else*: a
 * site that uploaded its logo still served Cogenta's own default favicon and
 * its own name as plain text on every page. This suite is the proof that
 * they now reach a rendered page, against a real server, a real media
 * library and a real theme.
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
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
      publish: ['editor'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-identity-'))
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

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function editorSession(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct-horse-battery')
}

async function adminSession(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct-horse-battery')
}

/** Publishes the page `/` resolves to, so there is a real document to inspect. */
async function seedHome(base: string, token: string): Promise<void> {
  const headers = auth(token)
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ values: { title: 'Home', slug: 'home' } }),
    })
  ).json()) as { data: { id: string } }
  await fetch(`${base}/api/content/page/${created.data.id}/publish`, { method: 'POST', headers })
}

async function upload(base: string, token: string, filename: string): Promise<string> {
  const response = await fetch(`${base}/api/media`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      kind: 'image',
      filename,
      mimeType: 'image/png',
      data: makePng(64, 64).toString('base64'),
      alt: 'The mark',
    }),
  })
  if (response.status !== 201) {
    throw new Error(`upload failed: ${response.status} ${await response.text()}`)
  }
  return ((await response.json()) as { data: { id: string } }).data.id
}

describe('site identity reaches the public page (audit T01)', () => {
  it('serves the chosen favicon, logo and share image, and falls back cleanly before anything is chosen', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const editorToken = await editorSession(root, server.base)
      await seedHome(server.base, editorToken)
      const adminToken = await adminSession(root, server.base)

      // Nothing chosen: Cogenta's own default favicon, and the site name in
      // text. This is the regression guard for every site that never opens
      // the identity card.
      const before = await (await fetch(`${server.base}/`)).text()
      expect(before).toContain(
        '<link rel="icon" type="image/png" href="/_cogenta/logo-cogenta.png">',
      )
      expect(before).toContain('>Test site</a>')
      expect(before).not.toContain('cg-site-header__logo')

      const faviconId = await upload(server.base, editorToken, 'favicon.png')
      const logoId = await upload(server.base, editorToken, 'logo.png')
      const logoDarkId = await upload(server.base, editorToken, 'logo-dark.png')
      const shareId = await upload(server.base, editorToken, 'share.png')

      const saved = await fetch(`${server.base}/api/theme/overrides`, {
        method: 'PUT',
        headers: auth(adminToken),
        body: JSON.stringify({
          faviconMediaId: faviconId,
          logoMediaId: logoId,
          logoDarkMediaId: logoDarkId,
          shareImageMediaId: shareId,
        }),
      })
      expect(saved.status).toBe(200)

      // The very next request, with no restart — the same "live read" every
      // other appearance setting already had.
      const after = await (await fetch(`${server.base}/`)).text()
      expect(after).toContain(`<link rel="icon" href="/_image?id=${faviconId}`)
      expect(after).not.toContain('href="/_cogenta/logo-cogenta.png"')
      // The logo replaced the wordmark, and kept the site name as its
      // accessible name rather than dropping it.
      expect(after).toContain('class="cg-site-header__logo"')
      expect(after).toContain(`/_image?id=${logoId}`)
      expect(after).toContain('alt="Test site"')
      // The dark variant is offered beside it, never chosen server-side.
      expect(after).toContain('media="(prefers-color-scheme: dark)"')
      expect(after).toContain(`/_image?id=${logoDarkId}`)
      // The share image becomes the default `og:image` — one effective
      // value, resolved from the appearance screen's own picker.
      expect(after).toContain(`https://example.com/_image?id=${shareId}`)
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('renders the logo in a second theme too, with that theme own markup', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const editorToken = await editorSession(root, server.base)
      await seedHome(server.base, editorToken)
      const adminToken = await adminSession(root, server.base)
      const logoId = await upload(server.base, editorToken, 'logo.png')

      const saved = await fetch(`${server.base}/api/theme/overrides`, {
        method: 'PUT',
        headers: auth(adminToken),
        body: JSON.stringify({
          activeTheme: '@cogenta/theme-magazine',
          logoMediaId: logoId,
        }),
      })
      expect(saved.status).toBe(200)

      const html = await (await fetch(`${server.base}/`)).text()
      // The magazine's nameplate, not the canonical theme's header class —
      // each theme places the mark in its own chrome.
      expect(html).toContain('cg-masthead__logo')
      expect(html).not.toContain('cg-site-header__logo')
      expect(html).toContain(`/_image?id=${logoId}`)
      expect(html).toContain('alt="Test site"')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('ignores a chosen media that is not an image rather than emitting a broken icon', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const editorToken = await editorSession(root, server.base)
      await seedHome(server.base, editorToken)
      const adminToken = await adminSession(root, server.base)

      // A media id that does not exist at all: the same code path a deleted
      // asset takes, and the one that used to be a `<link rel="icon">`
      // pointing at a 404.
      const saved = await fetch(`${server.base}/api/theme/overrides`, {
        method: 'PUT',
        headers: auth(adminToken),
        body: JSON.stringify({ faviconMediaId: '11111111-1111-4111-8111-111111111111' }),
      })
      expect(saved.status).toBe(200)

      const html = await (await fetch(`${server.base}/`)).text()
      expect(html).toContain('<link rel="icon" type="image/png" href="/_cogenta/logo-cogenta.png">')
    } finally {
      await server.stop()
    }
  }, 90_000)
})
