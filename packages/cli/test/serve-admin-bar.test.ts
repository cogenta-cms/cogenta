import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * The public-site admin bar (fiche 35 task 6), translated and white-labelled
 * (audit 2026-09-01, 10-coquille-reglages-dashboard.md T02).
 *
 * It had never had a test of its own — which is how "Cogenta Admin", "Edit
 * this page" and "New" stayed hardcoded English on a French, white-labelled
 * site for as long as they did.
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

async function project(defaultLocale: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-admin-bar-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: {
    name: 'Maison Verte',
    url: 'https://example.com',
    locales: [${JSON.stringify(defaultLocale)}],
    defaultLocale: ${JSON.stringify(defaultLocale)},
  },
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

/**
 * `locale` is sent explicitly, as the admin's own editor does. It has to be:
 * `cogenta serve` builds every content store without a `defaultLocale`, so an
 * entry created without one lands in `'en'` even on a site whose configured
 * `defaultLocale` is `fr` — a real, separate bug this suite is not the place
 * to fix (see the A4 correction report).
 */
async function seedHome(base: string, token: string, locale: string): Promise<void> {
  const headers = auth(token)
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ locale, values: { title: 'Accueil', slug: 'home' } }),
    })
  ).json()) as { data: { id: string } }
  await fetch(`${base}/api/content/page/${created.data.id}/publish`, { method: 'POST', headers })
}

describe('the public admin bar (audit T02)', () => {
  it('is invisible to an anonymous visitor, and English on an English site', async () => {
    const root = await project('en')
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin', 'editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct-horse-battery',
      )
      await seedHome(server.base, token, 'en')

      const anonymous = await (await fetch(`${server.base}/`)).text()
      expect(anonymous).not.toContain('cg-admin-bar')

      const signedIn = await (
        await fetch(`${server.base}/`, { headers: { authorization: `Bearer ${token}` } })
      ).text()
      expect(signedIn).toContain('cg-admin-bar')
      expect(signedIn).toContain('>Edit this page<')
      expect(signedIn).toContain('>New<')
      // Cogenta's credit is on by default, so the bar may name it.
      expect(signedIn).toContain('>Cogenta<')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('speaks French on a French site and names the site, not Cogenta, in white label', async () => {
    const root = await project('fr')
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin', 'editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct-horse-battery',
      )
      await seedHome(server.base, token, 'fr')

      const off = await fetch(`${server.base}/api/settings`, {
        method: 'PATCH',
        headers: auth(token),
        body: JSON.stringify({ key: 'branding.showCogentaBranding', value: false }),
      })
      expect(off.status).toBe(200)

      const html = await (
        await fetch(`${server.base}/`, { headers: { authorization: `Bearer ${token}` } })
      ).text()
      expect(html).toContain('cg-admin-bar')
      expect(html).toContain('>Modifier cette page<')
      expect(html).toContain('>Nouveau<')
      expect(html).toContain('>Maison Verte<')
      // The whole point: a white-labelled site never names the CMS behind it,
      // and the admin bar is on the *public* site, where every visitor's
      // editor sees it.
      expect(html).not.toContain('Cogenta')
    } finally {
      await server.stop()
    }
  }, 90_000)
})
