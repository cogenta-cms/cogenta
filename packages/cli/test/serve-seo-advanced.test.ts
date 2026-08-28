import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * Fiche 50, tasks 2-5, end to end against a real server and a real SQLite
 * database — the parts of `serve-seo.test.ts` (tasks 1-2 of the earlier L10
 * lot) do not already cover: search-engine verification meta tags,
 * robots.txt custom rules, `llms.txt`, and IndexNow's key file plus its
 * publish/unpublish ping. Task 1 (the Diagnostic tab's "Ouvrir" links) is a
 * pure admin-side link construction (`window.location.origin` + a fixed
 * path) covered by the admin's own component suite — nothing server-side to
 * assert here beyond "the URL it links to answers", which the sitemap/robots
 * tests in `serve-seo.test.ts` already prove.
 */

const PAGE: CollectionDefinition = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', required: true, options: { from: 'title' } },
    excerpt: { kind: 'text', options: { max: 400 } },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
}

const COLLECTIONS: readonly CollectionDefinition[] = [PAGE]
const SCHEMA = `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-seo-advanced-'))
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

/** Bootstrapped straight through the auth store, the same way `serve-seo-admin.test.ts` does it. */
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

async function writeSetting(root: string, key: string, value: unknown): Promise<void> {
  await writeSettings(root, { [key]: value })
}

/** One database open for every key, rather than one per key — each open costs real wall-clock time on a real SQLite file. */
async function writeSettings(
  root: string,
  values: Readonly<Record<string, unknown>>,
): Promise<void> {
  const { createSqliteHandle } = await import('@cogenta/core')
  const { createSiteSettingsStore, SITE_SETTINGS_SITE_SCOPE } = await import('@cogenta/schema')
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  const store = createSiteSettingsStore({ db })
  for (const [key, value] of Object.entries(values)) {
    await store.set(key, SITE_SETTINGS_SITE_SCOPE, value, null)
  }
  await db.close()
}

describe('cogenta serve — search-engine verification meta tags (fiche 50 task 2)', () => {
  it('omits both tags until set, then renders exactly the tokens saved — on every public page, not only entries', async () => {
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
      await fetch(`${server.base}/api/content/page/${created.data.id}/publish`, {
        method: 'POST',
        headers: authed(editor),
      })

      const before = await (await fetch(`${server.base}/hello-world`)).text()
      expect(before).not.toContain('google-site-verification')
      expect(before).not.toContain('msvalidate.01')

      await writeSettings(root, {
        'seo.googleSiteVerification': 'abc123',
        'seo.bingSiteVerification': 'XYZ-789',
      })

      const after = await (await fetch(`${server.base}/hello-world`)).text()
      expect(after).toContain('<meta name="google-site-verification" content="abc123" />')
      expect(after).toContain('<meta name="msvalidate.01" content="XYZ-789" />')

      // Every other public page carries the same tags, not only entry pages.
      const search = await (await fetch(`${server.base}/search?q=hello`)).text()
      expect(search).toContain('<meta name="google-site-verification" content="abc123" />')
    } finally {
      await server.stop()
    }
  }, 30_000)
})

describe('cogenta serve — robots.txt custom rules (fiche 50 task 4)', () => {
  it('merges an admin-written block after the derived group and before the sitemap line', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const before = await (await fetch(`${server.base}/robots.txt`)).text()
      expect(before).not.toContain('GPTBot')

      await writeSetting(root, 'seo.robotsCustomRules', 'User-agent: GPTBot\nDisallow: /')

      const after = await (await fetch(`${server.base}/robots.txt`)).text()
      expect(after).toContain('User-agent: GPTBot\nDisallow: /')
      // Still points at the real sitemap, after the custom block.
      const lines = after.trim().split('\n')
      expect(lines.at(-1)).toBe('Sitemap: https://example.com/sitemap.xml')
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — SEO feature grid gates (fiche 70 task 3)', () => {
  it('hides the custom robots.txt rule once seo.robotsCustomRulesEnabled is turned off, keeping the saved text', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      await writeSetting(root, 'seo.robotsCustomRules', 'User-agent: GPTBot\nDisallow: /')
      const enabled = await (await fetch(`${server.base}/robots.txt`)).text()
      expect(enabled).toContain('GPTBot')

      await writeSetting(root, 'seo.robotsCustomRulesEnabled', false)
      const disabled = await (await fetch(`${server.base}/robots.txt`)).text()
      expect(disabled).not.toContain('GPTBot')

      // The saved text is untouched — the gate hides its effect, it never
      // erases the setting `seo.robotsCustomRules` still holds.
      await writeSetting(root, 'seo.robotsCustomRulesEnabled', true)
      const restored = await (await fetch(`${server.base}/robots.txt`)).text()
      expect(restored).toContain('GPTBot')
    } finally {
      await server.stop()
    }
  })

  it('hides both search-engine verification meta tags once seo.searchVerificationEnabled is turned off', async () => {
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
      await fetch(`${server.base}/api/content/page/${created.data.id}/publish`, {
        method: 'POST',
        headers: authed(editor),
      })

      await writeSettings(root, {
        'seo.googleSiteVerification': 'abc123',
        'seo.bingSiteVerification': 'XYZ-789',
      })
      const enabled = await (await fetch(`${server.base}/hello-world`)).text()
      expect(enabled).toContain('google-site-verification')

      await writeSetting(root, 'seo.searchVerificationEnabled', false)
      const disabled = await (await fetch(`${server.base}/hello-world`)).text()
      expect(disabled).not.toContain('google-site-verification')
      expect(disabled).not.toContain('msvalidate.01')

      // Same tokens, restored the moment the gate is switched back on — no
      // re-entry needed.
      await writeSetting(root, 'seo.searchVerificationEnabled', true)
      const restored = await (await fetch(`${server.base}/hello-world`)).text()
      expect(restored).toContain('<meta name="google-site-verification" content="abc123" />')
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — llms.txt (fiche 50 task 5)', () => {
  it('404s until seo.llmsTxtEnabled is on, then lists published entries by collection', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const editor = await signIn(root, server.base, ['editor'])
      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers: authed(editor),
          body: JSON.stringify({
            values: { title: 'Hello world', slug: 'hello-world', excerpt: 'A first post.' },
          }),
        })
      ).json()) as { data: { id: string } }
      await fetch(`${server.base}/api/content/page/${created.data.id}/publish`, {
        method: 'POST',
        headers: authed(editor),
      })

      const before = await fetch(`${server.base}/llms.txt`)
      expect(before.status).toBe(404)

      await writeSetting(root, 'seo.llmsTxtEnabled', true)

      const after = await fetch(`${server.base}/llms.txt`)
      expect(after.status).toBe(200)
      expect(after.headers.get('content-type')).toContain('text/markdown')
      const text = await after.text()
      expect(text).toContain('# Test site')
      expect(text).toContain('## Pages')
      expect(text).toContain('[Hello world](https://example.com/hello-world): A first post.')
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — IndexNow (fiche 50 task 3)', () => {
  it('serves the key file only for the currently configured key, and only once enabled', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const key = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

      const missing = await fetch(`${server.base}/${key}.txt`)
      expect(missing.status).toBe(404)

      await writeSetting(root, 'seo.indexNowKey', key)
      // Key set, but IndexNow still off: still 404.
      const stillMissing = await fetch(`${server.base}/${key}.txt`)
      expect(stillMissing.status).toBe(404)

      await writeSetting(root, 'seo.indexNowEnabled', true)
      const found = await fetch(`${server.base}/${key}.txt`)
      expect(found.status).toBe(200)
      expect(await found.text()).toBe(`${key}\n`)

      // A path that merely looks like a key file, but is not the configured
      // one, gets the ordinary 404 — never a distinct "wrong key" response.
      const wrongKey = await fetch(`${server.base}/${'0'.repeat(32)}.txt`)
      expect(wrongKey.status).toBe(404)
    } finally {
      await server.stop()
    }
  })

  it('pings IndexNow on a real publish once enabled, and never when it is off', async () => {
    const root = await project()
    const server = await startServer(root)
    const key = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    const pings: string[] = []
    const originalFetch = globalThis.fetch
    // Only the real IndexNow endpoint is intercepted — every other `fetch`
    // call in this test (including the ones this test makes against the
    // server itself) goes through untouched.
    globalThis.fetch = (async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('api.indexnow.org')) {
        pings.push(String(init?.body))
        return new Response(null, { status: 200 })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const editor = await signIn(root, server.base, ['editor'])

      // Off by default: publishing does not ping.
      const first = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers: authed(editor),
          body: JSON.stringify({ values: { title: 'Before', slug: 'before' } }),
        })
      ).json()) as { data: { id: string } }
      await fetch(`${server.base}/api/content/page/${first.data.id}/publish`, {
        method: 'POST',
        headers: authed(editor),
      })
      expect(pings).toHaveLength(0)

      await writeSetting(root, 'seo.indexNowKey', key)
      await writeSetting(root, 'seo.indexNowEnabled', true)

      const second = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers: authed(editor),
          body: JSON.stringify({ values: { title: 'After', slug: 'after' } }),
        })
      ).json()) as { data: { id: string } }
      await fetch(`${server.base}/api/content/page/${second.data.id}/publish`, {
        method: 'POST',
        headers: authed(editor),
      })

      expect(pings).toHaveLength(1)
      const body = JSON.parse(pings[0] ?? '{}') as { host: string; key: string; urlList: string[] }
      expect(body.host).toBe('example.com')
      expect(body.key).toBe(key)
      expect(body.urlList).toEqual(['https://example.com/after'])

      // Unpublish pings again, for the same URL.
      await fetch(`${server.base}/api/content/page/${second.data.id}/unpublish`, {
        method: 'POST',
        headers: authed(editor),
      })
      expect(pings).toHaveLength(2)
    } finally {
      globalThis.fetch = originalFetch
      await server.stop()
    }
  })
})
