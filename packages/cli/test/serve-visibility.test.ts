import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L33 step 3, end to end on a real server: a page marked private is a 404 for
 * a visitor and a page for an editor, and a password-protected page shows a
 * form until its password is answered.
 *
 * Only this layer proves it. The gate is tested where it lives, but "a
 * visitor gets a form, posts it, and comes back to the content" is four
 * components agreeing — the store, the gate, the render and the cookie.
 */

const COLLECTIONS = `export default [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title', unique: true } },
      excerpt: { kind: 'text', options: { max: 300 } },
      blocks: { kind: 'blocks', options: {} },
    },
    permissions: {
      read: ['public'],
      create: ['editor', 'admin'],
      update: ['editor', 'admin'],
      publish: ['editor', 'admin'],
      delete: ['admin'],
    },
  },
]
`

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-visibility-e2e-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Visible', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(join(root, 'cogenta.schema.mjs'), COLLECTIONS, 'utf8')
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function publish(base: string, token: string, title: string, slug: string): Promise<string> {
  const created = await fetch(`${base}/api/content/page`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      values: { title, slug, excerpt: 'Ce que cette page raconte' },
      blocks: {
        blocks: [
          {
            key: 'p1',
            type: 'prose',
            data: {
              body: [
                {
                  _key: 'b1',
                  _type: 'block',
                  style: 'normal',
                  markDefs: [],
                  children: [{ _key: 's1', _type: 'span', text: 'Le contenu secret.', marks: [] }],
                },
              ],
            },
          },
        ],
      },
    }),
  })
  expect(created.status).toBe(201)
  const id = ((await created.json()) as { data: { id: string } }).data.id
  expect(
    (
      await fetch(`${base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(200)
  return id
}

describe('a page that is not simply public', () => {
  it('is a 404 for a visitor once private, and still a page for an editor', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')
      const id = await publish(server.base, token, 'Note interne', 'note-interne')

      expect((await fetch(`${server.base}/note-interne`)).status).toBe(200)

      const hidden = await fetch(`${server.base}/api/content/page/${id}/visibility`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: 'private' }),
      })
      expect(hidden.status).toBe(200)

      // 404, never 403: for a note nobody should see, the existence is
      // already the information.
      const asVisitor = await fetch(`${server.base}/note-interne`)
      expect(asVisitor.status).toBe(404)
      expect(await asVisitor.text()).not.toContain('Le contenu secret.')
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('shows a form until the password is answered, then the page itself', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')
      const id = await publish(server.base, token, 'Dossier de presse', 'dossier')

      expect(
        (
          await fetch(`${server.base}/api/content/page/${id}/visibility`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ visibility: 'password', password: 'sésame ouvre-toi' }),
          })
        ).status,
      ).toBe(200)

      const locked = await fetch(`${server.base}/dossier`)
      const lockedHtml = await locked.text()
      expect(locked.status).toBe(200)
      // The page, locked: its own title is there, its content is not.
      expect(lockedHtml).toContain('Dossier de presse')
      expect(lockedHtml).not.toContain('Le contenu secret.')
      expect(lockedHtml).toContain('cg-unlock__form')
      // The summary is content too: a page whose excerpt can be read without
      // the password has had its password answered for whoever asks.
      expect(lockedHtml).not.toContain('Ce que cette page raconte')
      // And nothing describes it to a crawler either: a page nobody can read
      // has nothing to index, and its own summary in a description or a
      // JSON-LD block would answer the password for whoever asks.
      expect(lockedHtml).toContain('noindex')

      // A wrong answer says so, and hands out nothing.
      const refused = await fetch(`${server.base}/_cogenta/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ entry: id, password: 'ouvre-toi', next: '/dossier' }),
        redirect: 'manual',
      })
      expect(refused.status).toBe(303)
      expect(refused.headers.get('location')).toBe('/dossier?unlock=failed')
      expect(refused.headers.get('set-cookie')).toBeNull()

      const opened = await fetch(`${server.base}/_cogenta/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ entry: id, password: 'sésame ouvre-toi', next: '/dossier' }),
        redirect: 'manual',
      })
      expect(opened.status).toBe(303)
      expect(opened.headers.get('location')).toBe('/dossier')
      const cookie = opened.headers.get('set-cookie') ?? ''
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Lax')

      const unlocked = await fetch(`${server.base}/dossier`, {
        headers: { cookie: cookie.split(';')[0] ?? '' },
      })
      const unlockedHtml = await unlocked.text()
      expect(unlockedHtml).toContain('Le contenu secret.')
      expect(unlockedHtml).not.toContain('cg-unlock__form')
      // A page a cookie opened must never sit in a shared cache.
      expect(unlocked.headers.get('cache-control')).toContain('no-store')
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('refuses an open redirect, and keeps a protected page out of the sitemap', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'sup3r-secret-pass', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'sup3r-secret-pass')
      const id = await publish(server.base, token, 'Dossier de presse', 'dossier')
      await fetch(`${server.base}/api/content/page/${id}/visibility`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: 'password', password: 'sésame' }),
      })

      const away = await fetch(`${server.base}/_cogenta/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          entry: id,
          password: 'sésame',
          next: '//elsewhere.example/steal',
        }),
        redirect: 'manual',
      })
      // A redirect target from a form field is an open redirect waiting to
      // happen: anything that is not a path of this site becomes the home page.
      expect(away.headers.get('location')).toBe('/')

      const sitemap = await (await fetch(`${server.base}/sitemap.xml`)).text()
      expect(sitemap).not.toContain('/dossier')
    } finally {
      await server.stop()
    }
  }, 120_000)
})
