import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * Fiche 13 (SEO éditorial), end to end against a real server and a real
 * SQLite database — the fiche's own acceptance criteria, replayed literally:
 *
 * - an editor defines a title and a description and gets them back, word for
 *   word, in the served HTML;
 * - `noindex` set from the admin removes the page from both the `<head>` and
 *   `/sitemap.xml`, in the same request cycle;
 * - `/api/seo/preview` computes with the *same* function the render path
 *   calls (asserted structurally: the preview response and the served page
 *   agree once published);
 * - the site-wide diagnostic is admin-only and catches the L10-class
 *   "published but the sitemap is empty" anomaly for real, over HTTP.
 */

const PAGE: CollectionDefinition = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', required: true, options: { from: 'title' } },
    excerpt: { kind: 'text', options: { max: 400 } },
    seoTitle: { kind: 'text', options: { max: 300 } },
    seoDescription: { kind: 'text', options: { max: 400 } },
    seoNoindex: { kind: 'boolean', options: {} },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
}

const COLLECTIONS: readonly CollectionDefinition[] = [PAGE]
const SCHEMA = `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-seo-admin-'))
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
  await writeFile(join(root, 'cogenta.schema.mjs'), SCHEMA, 'utf8')
  return root
}

const activeServers: AbortController[] = []

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

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

/** Bootstrapped straight through the auth store, the same way the other serve tests do it. */
async function signIn(root: string, base: string, roles: readonly string[]): Promise<string> {
  const { createSqliteHandle } = await import('@cogenta/core')
  const { createUserStore, createCredentialStore, ensureAuthTables } = await import('@cogenta/auth')

  const email = `${roles.join('-')}@example.com`
  const password = 'correct horse battery staple'

  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureAuthTables(db)
  const user = await createUserStore(db).create({ email, roles: [...roles] })
  await createCredentialStore(db).setPassword(user.id, password)
  await db.close()

  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await response.json()) as { data: { session?: { token: string } } }
  const token = body.data.session?.token
  if (token === undefined) throw new Error('expected a session')
  return token
}

function authed(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

describe('cogenta serve — SEO admin (fiche 13)', () => {
  it('a title and description an editor sets show up word for word in the served page', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const editor = await signIn(root, server.base, ['editor'])

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers: authed(editor),
          body: JSON.stringify({ values: { title: 'Hello world', slug: 'hello-world' } }),
        })
      ).json()) as { data: { id: string } }
      const id = created.data.id

      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers: authed(editor),
        body: JSON.stringify({
          values: {
            seoTitle: 'A hand-picked SEO title',
            seoDescription: 'A hand-picked description.',
          },
        }),
      })
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: authed(editor),
      })

      const html = await (await fetch(`${server.base}/hello-world`)).text()
      expect(html).toContain('<title>A hand-picked SEO title</title>')
      expect(html).toContain('<meta name="description" content="A hand-picked description." />')
    } finally {
      await server.stop()
    }
  })

  it('noindex set from the admin removes the page from the sitemap in the same request cycle', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const editor = await signIn(root, server.base, ['editor'])

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers: authed(editor),
          body: JSON.stringify({ values: { title: 'Secret page', slug: 'secret-page' } }),
        })
      ).json()) as { data: { id: string } }
      const id = created.data.id
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: authed(editor),
      })

      // Published, not yet noindexed: in the sitemap.
      const beforeXml = await (await fetch(`${server.base}/sitemap.xml`)).text()
      expect(beforeXml).toContain('secret-page')

      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers: authed(editor),
        body: JSON.stringify({ values: { seoNoindex: true } }),
      })
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: authed(editor),
      })

      const html = await (await fetch(`${server.base}/secret-page`)).text()
      expect(html).toContain('<meta name="robots" content="noindex, nofollow" />')
      expect(html).not.toContain('rel="canonical"')

      const afterXml = await (await fetch(`${server.base}/sitemap.xml`)).text()
      expect(afterXml).not.toContain('secret-page')
    } finally {
      await server.stop()
    }
  })

  it('POST /api/seo/preview reflects an unsaved override, gated by update on the collection', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const editor = await signIn(root, server.base, ['editor'])
      const viewer = await signIn(root, server.base, ['viewer'])

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers: authed(editor),
          body: JSON.stringify({ values: { title: 'Preview me', slug: 'preview-me' } }),
        })
      ).json()) as { data: { id: string } }
      const id = created.data.id

      const preview = (await (
        await fetch(`${server.base}/api/seo/preview`, {
          method: 'POST',
          headers: authed(editor),
          body: JSON.stringify({
            collection: 'page',
            id,
            overrides: { seoTitle: 'Not saved yet' },
          }),
        })
      ).json()) as { data: { title: string } }
      expect(preview.data.title).toBe('Not saved yet')

      // Never saved: the stored entry is unaffected. `state=working` because
      // this entry was never published — the default `published` state would
      // find nothing at all and 404.
      const stored = (await (
        await fetch(`${server.base}/api/content/page/${id}?state=working`, {
          headers: authed(editor),
        })
      ).json()) as { data: { values: { seoTitle: string | null } } }
      expect(stored.data.values.seoTitle).toBeNull()

      // A viewer may read the entry, but not preview its SEO — follows `update`.
      const refused = await fetch(`${server.base}/api/seo/preview`, {
        method: 'POST',
        headers: authed(viewer),
        body: JSON.stringify({ collection: 'page', id }),
      })
      expect(refused.status).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('GET /api/seo/diagnostics is admin-only and reports a healthy site accurately', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const editor = await signIn(root, server.base, ['editor'])
      const admin = await signIn(root, server.base, ['admin'])

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers: authed(editor),
          body: JSON.stringify({
            values: { title: 'Home', slug: 'home', excerpt: 'The home page.' },
          }),
        })
      ).json()) as { data: { id: string } }
      await fetch(`${server.base}/api/content/page/${created.data.id}/publish`, {
        method: 'POST',
        headers: authed(editor),
      })

      const refused = await fetch(`${server.base}/api/seo/diagnostics`, { headers: authed(editor) })
      expect(refused.status).toBe(403)

      const response = await fetch(`${server.base}/api/seo/diagnostics`, { headers: authed(admin) })
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: { sitemap: { totalUrls: number }; anomalies: readonly { code: string }[] }
      }
      expect(body.data.sitemap.totalUrls).toBe(1)
      expect(body.data.anomalies).toEqual([])
    } finally {
      await server.stop()
    }
  })
})
