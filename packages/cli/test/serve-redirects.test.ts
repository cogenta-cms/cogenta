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

async function project(
  security?: string,
  webhooks?: string,
  notFoundLog?: string,
  collections: readonly CollectionDefinition[] = COLLECTIONS,
): Promise<string> {
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
}${notFoundLog === undefined ? '' : `  notFoundLog: ${notFoundLog},\n`}}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(collections, null, 2)}\n`,
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

interface Entry {
  readonly id: string
}

async function editorHeaders(root: string, base: string): Promise<Record<string, string>> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  const token = await loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
  return { 'content-type': 'application/json', authorization: `Bearer ${token}` }
}

describe('cogenta serve — renaming a published slug (fiche 12 task 3)', () => {
  it('writes a working 301 the moment a published slug is renamed, preserving the query string', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const headers = await editorHeaders(root, server.base)

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'Original title', slug: 'original-title' } }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: { authorization: headers.authorization ?? '' },
      })

      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { slug: 'renamed-title' } }),
      })

      const visitor = await fetch(`${server.base}/original-title?utm_source=newsletter`, {
        redirect: 'manual',
      })
      expect(visitor.status).toBe(301)
      expect(visitor.headers.get('location')).toBe('/renamed-title?utm_source=newsletter')
      await visitor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('reduces a chain of renames A→B→C to a single hop for a visitor', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const headers = await editorHeaders(root, server.base)

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'A', slug: 'a' } }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: { authorization: headers.authorization ?? '' },
      })

      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { slug: 'b' } }),
      })
      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { slug: 'c' } }),
      })

      // The redirect table is admin-only (unlike content), so the check
      // needs a real admin token — the editor's token that wrote the
      // renames cannot read it back.
      const adminBearer = await adminToken(root, server.base)
      const table = await fetch(`${server.base}/api/redirects`, {
        headers: { authorization: `Bearer ${adminBearer}` },
      })
      const rows = ((await table.json()) as { data: readonly { from: string; to: string }[] }).data
      expect(rows.map((row) => [row.from, row.to])).toEqual(
        expect.arrayContaining([
          ['/a', '/c'],
          ['/b', '/c'],
        ]),
      )

      const visitor = await fetch(`${server.base}/a`, { redirect: 'manual' })
      expect(visitor.status).toBe(301)
      expect(visitor.headers.get('location')).toBe('/c')
      await visitor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('makes the redirect disappear when the editor renames back to the old slug', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const headers = await editorHeaders(root, server.base)

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'X', slug: 'x' } }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: { authorization: headers.authorization ?? '' },
      })

      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { slug: 'y' } }),
      })
      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { slug: 'x' } }),
      })

      const visitor = await fetch(`${server.base}/x`, { redirect: 'manual' })
      expect(visitor.status).toBe(200)
      await visitor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('never redirects a draft: a slug renamed before publish leaves no trail', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const headers = await editorHeaders(root, server.base)

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'Draft', slug: 'draft-slug' } }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id

      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { slug: 'renamed-draft-slug' } }),
      })

      const adminBearer = await adminToken(root, server.base)
      const table = await fetch(`${server.base}/api/redirects`, {
        headers: { authorization: `Bearer ${adminBearer}` },
      })
      expect(((await table.json()) as { data: readonly unknown[] }).data).toHaveLength(0)
    } finally {
      await server.stop()
    }
  }, 60_000)
})

describe('cogenta serve — the 404 log (fiche 12 task 1)', () => {
  it('aggregates repeated 404s by path and shows the busiest first, admin-only', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await fetch(`${server.base}/never-existed`)
      await fetch(`${server.base}/never-existed`)
      await fetch(`${server.base}/only-once`)

      const anonymous = await fetch(`${server.base}/api/not-found`)
      expect(anonymous.status).toBe(403)
      await anonymous.arrayBuffer()

      const token = await adminToken(root, server.base)
      const listed = await fetch(`${server.base}/api/not-found`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(listed.status).toBe(200)
      const rows = (
        (await listed.json()) as {
          data: readonly { path: string; hits: number; lastReferrer: string | null }[]
        }
      ).data
      expect(rows[0]).toMatchObject({ path: '/never-existed', hits: 2 })
      expect(rows.map((row) => row.path)).toContain('/only-once')
      // Never anything an IP or a user agent could be read out of.
      expect(rows.every((row) => Object.keys(row).length === 5)).toBe(true)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('never records an /api/* miss as a broken page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await fetch(`${server.base}/api/this-route-does-not-exist`)

      const token = await adminToken(root, server.base)
      const listed = await fetch(`${server.base}/api/not-found`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(((await listed.json()) as { data: readonly unknown[] }).data).toHaveLength(0)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('can be turned off from the config, and stops recording new paths', async () => {
    const root = await project(undefined, undefined, '{ enabled: false }')
    const server = await startServer(root, { registry: activeServers })
    try {
      await fetch(`${server.base}/never-existed`)

      const token = await adminToken(root, server.base)
      const listed = await fetch(`${server.base}/api/not-found`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(((await listed.json()) as { data: readonly unknown[] }).data).toHaveLength(0)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('stops tracking new distinct paths once maxPaths is reached, without erroring the request', async () => {
    const root = await project(undefined, undefined, '{ maxPaths: 2 }')
    const server = await startServer(root, { registry: activeServers })
    try {
      const first = await fetch(`${server.base}/missing-one`)
      expect(first.status).toBe(404)
      await first.arrayBuffer()
      const second = await fetch(`${server.base}/missing-two`)
      await second.arrayBuffer()
      const third = await fetch(`${server.base}/missing-three`)
      expect(third.status).toBe(404) // still a plain 404, never a 500
      await third.arrayBuffer()

      const token = await adminToken(root, server.base)
      const listed = await fetch(`${server.base}/api/not-found`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(((await listed.json()) as { data: readonly unknown[] }).data).toHaveLength(2)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('runs its purge tick repeatedly without erroring or removing anything still within retention', async () => {
    // `retainDays` bottoms out at 1 (a real day), so this cannot watch an
    // entry actually expire without waiting a real day — that arithmetic is
    // already proven, with an injectable clock, by
    // `packages/schema/test/routing/not-found-log.test.ts`. What this proves
    // instead: `runServe`'s own interval really calls `tickNotFoundPurge`
    // repeatedly (never fatally) and a fresh entry survives it.
    const root = await project(undefined, undefined, '{ retainDays: 1 }')
    const server = await startServer(root, {
      registry: activeServers,
      notFoundPurgeTickMs: 30,
    })
    try {
      await fetch(`${server.base}/still-within-retention`)
      const token = await adminToken(root, server.base)

      await new Promise((resolve) => setTimeout(resolve, 200))

      const listed = await fetch(`${server.base}/api/not-found`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(listed.status).toBe(200)
      const rows = ((await listed.json()) as { data: readonly { path: string }[] }).data
      expect(rows.map((row) => row.path)).toContain('/still-within-retention')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('lets an admin create a redirect from a logged 404 in two calls', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await fetch(`${server.base}/old-campaign-link`)
      const token = await adminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const [logged] = (
        (await (await fetch(`${server.base}/api/not-found`, { headers })).json()) as {
          data: readonly { path: string }[]
        }
      ).data
      expect(logged?.path).toBe('/old-campaign-link')

      const created = await fetch(`${server.base}/api/redirects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ from: logged?.path, to: '/home' }),
      })
      expect(created.status).toBe(201)

      const visitor = await fetch(`${server.base}/old-campaign-link`, { redirect: 'manual' })
      expect(visitor.status).toBe(301)
      await visitor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})

describe('cogenta serve — prefix redirects and 410 Gone (fiche 12 task 4)', () => {
  it('rewrites every URL under a prefix', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await fetch(`${server.base}/api/redirects/patterns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ fromPrefix: '/blog/*', toPrefix: '/actualites/*' }),
      })

      const visitor = await fetch(`${server.base}/blog/my-old-post`, { redirect: 'manual' })
      expect(visitor.status).toBe(301)
      expect(visitor.headers.get('location')).toBe('/actualites/my-old-post')
      await visitor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('answers 410 with no Location header for a page marked Gone', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      await fetch(`${server.base}/api/redirects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ from: '/discontinued-product', status: 410 }),
      })

      const visitor = await fetch(`${server.base}/discontinued-product`, { redirect: 'manual' })
      expect(visitor.status).toBe(410)
      expect(visitor.headers.get('location')).toBeNull()
      await visitor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('lets an exact redirect win over a broader prefix rule', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
      await fetch(`${server.base}/api/redirects/patterns`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fromPrefix: '/blog/*', toPrefix: '/actualites/*' }),
      })
      await fetch(`${server.base}/api/redirects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ from: '/blog/special-post', to: '/curated-landing-page' }),
      })

      const visitor = await fetch(`${server.base}/blog/special-post`, { redirect: 'manual' })
      expect(visitor.headers.get('location')).toBe('/curated-landing-page')
      await visitor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})
