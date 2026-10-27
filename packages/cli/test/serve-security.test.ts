import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { THEME_TOGGLE_SCRIPT } from '@cogenta/theme-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { cspHashOf, THEME_TOGGLE_SCRIPT_HASH } from '../src/commands/csp.js'
import { FORM_CONDITIONS_SCRIPT } from '../src/commands/forms-page.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/** The text of every executable inline `<script>` of a page (not `src=` ones, not JSON data blocks). */
function inlineScripts(html: string): string[] {
  const found: string[] = []
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/giu)) {
    const attributes = match[1] ?? ''
    if (/\bsrc=/u.test(attributes)) continue
    if (/type="application\/(ld\+)?json"/u.test(attributes)) continue
    found.push(match[2] ?? '')
  }
  return found
}

/**
 * L10 task 6, against a real server: CORS, security headers, cache-control.
 *
 * The defaults are the interesting half. CORS off unless a site names an
 * origin, and HSTS off unless a site asks for it, are decisions a test has to
 * pin — both are the kind of thing a later "helpful" default would quietly
 * turn on, and both break a real deployment when wrong.
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

async function project(security?: string, extraConfig = ''): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-security-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
${security === undefined ? '' : `  security: ${security},\n`}${extraConfig}}
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

async function seedPage(root: string, base: string): Promise<void> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  const token = await loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ values: { title: 'A page', slug: 'a-page' } }),
    })
  ).json()) as { data: { id: string } }
  await fetch(`${base}/api/content/page/${created.data.id}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('cogenta serve — security headers (L10 task 6)', () => {
  it('sends the always-on headers on every response, HTML and JSON alike', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await seedPage(root, server.base)

      for (const path of ['/a-page', '/api/content/page', '/robots.txt']) {
        const response = await fetch(`${server.base}${path}`)
        expect(response.headers.get('x-content-type-options')).toBe('nosniff')
        expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
        expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
        await response.arrayBuffer()
      }
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('sends no HSTS unless the site asks for it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/robots.txt`)
      // HSTS on a host that is not fully HTTPS locks browsers out of it with
      // no server-side undo. Off unless asked, and never over plain HTTP.
      expect(response.headers.get('strict-transport-security')).toBeNull()
      await response.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('sends a blocking default CSP on the admin, a public page, the 404 page and a JSON response', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await seedPage(root, server.base)

      const policies = new Map<string, string>()
      for (const path of ['/admin', '/a-page', '/no-such-page', '/', '/api/content/page']) {
        const response = await fetch(`${server.base}${path}`)
        const policy = response.headers.get('content-security-policy')
        expect(policy, path).not.toBeNull()
        policies.set(path, policy ?? '')
        await response.arrayBuffer()
      }

      for (const [path, policy] of policies) {
        // Never inline scripts in general, on any class of path.
        expect(policy, path).not.toMatch(/script-src[^;]*'unsafe-inline'/u)
        expect(policy, path).not.toMatch(/script-src[^;]*'unsafe-eval'/u)
      }
      expect(policies.get('/admin')).toContain("script-src 'self'")
      expect(policies.get('/admin')).toContain("img-src 'self' data: blob:")
      expect(policies.get('/admin')).toContain("object-src 'none'")
      expect(policies.get('/admin')).toContain("frame-ancestors 'self'")
      expect(policies.get('/a-page')).toContain(`script-src 'self' ${THEME_TOGGLE_SCRIPT_HASH}`)
      expect(policies.get('/no-such-page')).toBe(policies.get('/a-page'))
      expect(policies.get('/')).toBe(policies.get('/a-page'))
      expect(policies.get('/api/content/page')).toContain("default-src 'none'")
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('allows exactly the inline scripts a public page emits, by hash, and no others', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await seedPage(root, server.base)
      for (const path of ['/a-page', '/no-such-page']) {
        const response = await fetch(`${server.base}${path}`)
        const policy = response.headers.get('content-security-policy') ?? ''
        const html = await response.text()
        const scripts = inlineScripts(html)
        // The theme toggle is the one inline script a public page has.
        expect(scripts, path).toContain(THEME_TOGGLE_SCRIPT)
        for (const script of scripts) {
          expect(policy, `${path}: ${script.slice(0, 40)}`).toContain(cspHashOf(script))
        }
      }
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('allows the conditional-fields script of a form page, and Turnstile only there', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )
      const created = await fetch(`${server.base}/api/forms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'contact',
          label: 'Contact us',
          fields: [
            {
              name: 'kind',
              label: 'Kind',
              kind: 'choiceSingle',
              required: true,
              choices: ['a', 'b'],
            },
            {
              name: 'detail',
              label: 'Detail',
              kind: 'text',
              required: false,
              showIf: { field: 'kind', operator: 'equals', value: 'b' },
            },
          ],
          notifyEmails: ['owner@example.com'],
        }),
      })
      expect(created.status).toBe(201)

      const page = await fetch(`${server.base}/forms/contact`)
      const policy = page.headers.get('content-security-policy') ?? ''
      const html = await page.text()
      const scripts = inlineScripts(html)
      expect(scripts).toContain(FORM_CONDITIONS_SCRIPT)
      for (const script of scripts) expect(policy).toContain(cspHashOf(script))
      expect(policy).toContain('https://challenges.cloudflare.com')

      const elsewhere = await fetch(`${server.base}/`)
      expect(elsewhere.headers.get('content-security-policy')).not.toContain('cloudflare')
      await elsewhere.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('opens Google Fonts in the default CSP only when appearance.remoteWebFonts is on', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/robots.txt`)
      expect(response.headers.get('content-security-policy')).not.toContain('googleapis')
      await response.arrayBuffer()
    } finally {
      await server.stop()
    }

    const remote = await project(undefined, '  appearance: { remoteWebFonts: true },\n')
    const remoteServer = await startServer(remote, { registry: activeServers })
    try {
      const response = await fetch(`${remoteServer.base}/robots.txt`)
      const policy = response.headers.get('content-security-policy') ?? ''
      expect(policy).toContain('https://fonts.googleapis.com')
      expect(policy).toContain('https://fonts.gstatic.com')
      await response.arrayBuffer()
    } finally {
      await remoteServer.stop()
    }
  }, 60_000)

  it('sends no CSP at all when the site sets csp: false', async () => {
    const root = await project('{ csp: false }')
    const server = await startServer(root, { registry: activeServers })
    try {
      for (const path of ['/admin', '/robots.txt', '/api/content/page']) {
        const response = await fetch(`${server.base}${path}`)
        expect(response.headers.get('content-security-policy'), path).toBeNull()
        await response.arrayBuffer()
      }
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('sends the configured CSP verbatim', async () => {
    const root = await project(`{ csp: "default-src 'self'; img-src 'self' data:" }`)
    const server = await startServer(root, { registry: activeServers })
    try {
      for (const path of ['/robots.txt', '/admin', '/api/content/page']) {
        const response = await fetch(`${server.base}${path}`)
        expect(response.headers.get('content-security-policy'), path).toBe(
          "default-src 'self'; img-src 'self' data:",
        )
        await response.arrayBuffer()
      }
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('keeps HSTS off over plain HTTP even when configured, so localhost is never pinned', async () => {
    const root = await project('{ hstsMaxAge: 31536000 }')
    const server = await startServer(root, { registry: activeServers })
    try {
      const plain = await fetch(`${server.base}/robots.txt`)
      expect(plain.headers.get('strict-transport-security')).toBeNull()
      await plain.arrayBuffer()

      // Behind a TLS-terminating proxy that says so, it is sent.
      const proxied = await fetch(`${server.base}/robots.txt`, {
        headers: { 'x-forwarded-proto': 'https' },
      })
      expect(proxied.headers.get('strict-transport-security')).toBe(
        'max-age=31536000; includeSubDomains',
      )
      await proxied.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})

describe('cogenta serve — CORS (L10 task 6)', () => {
  it('is off by default: no allow-origin header, and a preflight grants nothing', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/content/page`, {
        headers: { origin: 'https://app.example.com' },
      })
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
      await response.arrayBuffer()

      const preflight = await fetch(`${server.base}/api/content/page`, {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-methods')).toBeNull()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('allows exactly the configured origins, and echoes rather than reflects', async () => {
    const root = await project(`{ cors: { origins: ['https://app.example.com'] } }`)
    const server = await startServer(root, { registry: activeServers })
    try {
      const allowed = await fetch(`${server.base}/api/content/page`, {
        headers: { origin: 'https://app.example.com' },
      })
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
      // A shared cache that stored one origin's response and served it to
      // another is the whole class of CORS cache-poisoning bugs.
      expect(allowed.headers.get('vary')).toBe('Origin')
      await allowed.arrayBuffer()

      const stranger = await fetch(`${server.base}/api/content/page`, {
        headers: { origin: 'https://evil.example.com' },
      })
      expect(stranger.headers.get('access-control-allow-origin')).toBeNull()
      await stranger.arrayBuffer()

      const preflight = await fetch(`${server.base}/api/content/page`, {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-methods')).toContain('PATCH')
      expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization')
      expect(preflight.headers.get('access-control-max-age')).toBe('600')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses to start when credentials are combined with the wildcard origin', async () => {
    const root = await project(`{ cors: { origins: ['*'], credentials: true } }`)
    const { runServe } = await import('../src/commands/serve.js')
    const { createOutput } = await import('../src/output.js')
    const errors: string[] = []
    // Every browser refuses that pair, so a server that accepted it would
    // look configured while granting nothing.
    await expect(
      runServe({
        cwd: root,
        env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
        out: createOutput(() => undefined, false),
        stderr: (text) => errors.push(text),
        port: 0,
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' })
  }, 60_000)
})

describe('cogenta serve — cache-control (L10 task 6)', () => {
  it('never stores an API response, and caches a public page only briefly', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await seedPage(root, server.base)

      const api = await fetch(`${server.base}/api/content/page`)
      expect(api.headers.get('cache-control')).toBe('no-store')
      await api.arrayBuffer()

      const page = await fetch(`${server.base}/a-page`)
      expect(page.headers.get('cache-control')).toBe(
        'public, max-age=0, s-maxage=60, must-revalidate',
      )
      await page.arrayBuffer()

      // The admin is a signed-in application, never a cacheable document.
      const admin = await fetch(`${server.base}/admin`)
      expect(admin.headers.get('cache-control')).toBe('no-store')
      await admin.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('never lets a shared cache store a page rendered for a signed-in actor', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'Embargoed', slug: 'embargoed' } }),
        })
      ).json()) as { data: { id: string } }
      await fetch(`${server.base}/api/content/page/${created.data.id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      // A page render is per-actor: the same URL answers with the draft for
      // an editor. `public, s-maxage=…` is exactly what RFC 9111 §3.5 says
      // re-authorises a shared cache to store a response to a request that
      // carried `Authorization` — a CDN would then serve it to everyone.
      const asEditor = await fetch(`${server.base}/embargoed`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(asEditor.headers.get('cache-control')).toBe('private, no-store')
      await asEditor.arrayBuffer()

      const anonymous = await fetch(`${server.base}/embargoed`)
      expect(anonymous.headers.get('cache-control')).toBe(
        'public, max-age=0, s-maxage=60, must-revalidate',
      )
      await anonymous.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('honours a configured page lifetime, including zero', async () => {
    const root = await project('{ pageMaxAge: 0 }')
    const server = await startServer(root, { registry: activeServers })
    try {
      await seedPage(root, server.base)
      const page = await fetch(`${server.base}/a-page`)
      expect(page.headers.get('cache-control')).toBe('no-store')
      await page.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})
