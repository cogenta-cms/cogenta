import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger, createSqliteHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * `GET /api/shell-status` (fiche 35 task 3), reachable through a real
 * `cogenta serve` — the aggregated read the admin's own chrome uses to draw
 * a trash badge and hide the commerce/marketplace groups a site has never
 * used, in one request rather than one per badge.
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-shell-status-'))

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
    `export default [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['editor'],
    },
  },
  {
    name: 'log_entry',
    labels: { singular: 'Log entry', plural: 'Log entries' },
    trash: false,
    fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['editor'],
    },
  },
]
`,
    'utf8',
  )

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
    env: { COGENTA_AUTH_SIGNING_KEY: SIGNING_KEY },
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

async function signIn(root: string, base: string, roles: readonly string[]): Promise<string> {
  const { createUserStore, createCredentialStore, ensureAuthTables } = await import('@cogenta/auth')

  const email = `${roles.join('-') || 'nobody'}@example.com`
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

interface ShellStatusBody {
  readonly data: {
    readonly trash: number
    readonly commerceOrdersPending: number | null
    readonly commerceActive: boolean
    readonly marketplaceUpdates: number | null
  }
}

describe('the shell status route, end to end', () => {
  it('answers an anonymous request with an all-empty status rather than a refusal', async () => {
    const root = await project()
    const server = await startServer(root)

    const response = await fetch(`${server.base}/api/shell-status`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as ShellStatusBody
    expect(body.data).toEqual({
      trash: 0,
      commerceOrdersPending: null,
      commerceActive: false,
      marketplaceUpdates: null,
      commentsPending: null,
    })
  })

  it('counts a real trashed entry, and never asks a collection declared `trash: false`', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['editor'])
    const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const created = await fetch(`${server.base}/api/content/article`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ values: { title: 'To be thrown away' } }),
    })
    expect(created.status).toBe(201)
    const article = ((await created.json()) as { data: { id: string } }).data

    const trashed = await fetch(`${server.base}/api/content/article/${article.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    expect(trashed.status).toBe(204)

    const status = await fetch(`${server.base}/api/shell-status`, { headers: authHeaders })
    expect(status.status).toBe(200)
    const body = (await status.json()) as ShellStatusBody
    expect(body.data.trash).toBe(1)
  })

  it('reports the shop inactive with an empty catalogue and orders as zero, never null, for a real role', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['editor'])

    const response = await fetch(`${server.base}/api/shell-status`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = (await response.json()) as ShellStatusBody
    expect(body.data.commerceActive).toBe(false)
    expect(body.data.commerceOrdersPending).toBe(0)
  })

  it('reports the shop active once a real product exists, over the same commerce router', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])
    const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const created = await fetch(`${server.base}/api/commerce/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ handle: 'first-product', title: 'First product' }),
    })
    expect(created.status).toBe(201)

    const response = await fetch(`${server.base}/api/shell-status`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = (await response.json()) as ShellStatusBody
    expect(body.data.commerceActive).toBe(true)
  })

  it('answers null marketplace updates for a non-admin, and a real number for admin', async () => {
    const root = await project()
    const server = await startServer(root)
    const editorToken = await signIn(root, server.base, ['editor'])
    const adminToken = await signIn(root, server.base, ['admin'])

    const asEditor = await fetch(`${server.base}/api/shell-status`, {
      headers: { authorization: `Bearer ${editorToken}` },
    })
    const editorBody = (await asEditor.json()) as ShellStatusBody
    expect(editorBody.data.marketplaceUpdates).toBe(null)

    const asAdmin = await fetch(`${server.base}/api/shell-status`, {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const adminBody = (await asAdmin.json()) as ShellStatusBody
    // An empty configured catalogue: reachable and answered as a real
    // number (nothing installed, so nothing has an update), not `null`.
    expect(adminBody.data.marketplaceUpdates).toBe(0)
  })

  it('refuses a write method', async () => {
    const root = await project()
    const server = await startServer(root)

    const response = await fetch(`${server.base}/api/shell-status`, { method: 'POST' })
    expect(response.status).toBe(405)
  })
})
