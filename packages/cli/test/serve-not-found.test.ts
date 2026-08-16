import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L14 task 2 — "Gestion des URLs 404 personnalisées par site", end to end.
 *
 * The whole design is that a custom 404 is not a new mechanism: it is an
 * ordinary published page at a configured path, rendered by the same function
 * and read through the same permission-checked gateway as every other page.
 * These tests exercise exactly that, over real HTTP.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    versioning: { drafts: true, history: true },
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

async function project(notFoundPath?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-404-e2e-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: {
    name: 'Test site',
    url: 'https://example.com'${
      notFoundPath === undefined ? '' : `,\n    notFoundPath: ${JSON.stringify(notFoundPath)}`
    }
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

async function publishPage(
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
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: '{}',
  })
  expect(published.status).toBe(200)
}

async function editorToken(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct-horse-battery-staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct-horse-battery-staple')
}

describe('a site 404 page', () => {
  it('serves the site own page, with a real 404 status, for an unmatched URL', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await editorToken(root, server.base)
    await publishPage(server.base, token, 'Page not found — try the search', '404')

    const response = await fetch(`${server.base}/no-such-page`)

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    expect(html).toContain('Page not found')
    expect(html).toContain('<!doctype html>')

    await server.stop()
  })

  it('falls back to the plain refusal when the site wrote no 404 page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })

    const response = await fetch(`${server.base}/no-such-page`)

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('CONTENT_NOT_FOUND')

    await server.stop()
  })

  it('honours a site that puts its 404 page somewhere else', async () => {
    const root = await project('/oops')
    const server = await startServer(root, { registry: activeServers })
    const token = await editorToken(root, server.base)
    await publishPage(server.base, token, 'Nothing here', 'oops')

    const response = await fetch(`${server.base}/no-such-page`)

    expect(response.status).toBe(404)
    expect(await response.text()).toContain('Nothing here')

    // A page at the default path is not consulted when another one is named.
    await publishPage(server.base, token, 'Unused default', '404')
    expect(await (await fetch(`${server.base}/still-nothing`)).text()).toContain('Nothing here')

    await server.stop()
  })

  it('answers the 404 page own URL with 200, not with itself as an error', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await editorToken(root, server.base)
    await publishPage(server.base, token, 'Page not found', '404')

    const response = await fetch(`${server.base}/404`)

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Page not found')

    await server.stop()
  })

  it('does not use an unpublished 404 page for an anonymous visitor', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await editorToken(root, server.base)
    // Created but never published: the public must not see a draft, and the
    // 404 path goes through the same gateway as everything else, so it cannot.
    const created = await fetch(`${server.base}/api/content/page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: { title: 'Draft only', slug: '404' } }),
    })
    expect(created.status).toBe(201)

    const response = await fetch(`${server.base}/no-such-page`)

    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.text()).not.toContain('Draft only')

    await server.stop()
  })

  it('leaves an unmatched API path answering as an API, not as a page', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await editorToken(root, server.base)
    await publishPage(server.base, token, 'Page not found', '404')

    const response = await fetch(`${server.base}/api/content/page/does-not-exist`, {
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')

    await server.stop()
  })
})
