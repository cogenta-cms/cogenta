import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * L17's marketplace router, wired into a real `cogenta serve`. The router
 * itself and the catalog/installer it calls are proven in
 * `@cogenta/api`'s and `@cogenta/plugins`' own suites — this file proves
 * only that the route is actually reachable and admin-gated on a real
 * server, the same thing `serve-taxonomies-trash.test.ts` proves for
 * `/api/taxonomies`.
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-marketplace-'))

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

  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')

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

describe('the marketplace, end to end', () => {
  it('answers an admin with the empty catalog, real router and real tables', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])

    const response = await fetch(`${server.base}/api/marketplace/items`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: unknown[] }
    expect(body.data).toEqual([])
  })

  it('refuses a non-admin actor, never a UI-only gate', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['editor'])

    const response = await fetch(`${server.base}/api/marketplace/items`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(403)
  })

  it('refuses an anonymous request', async () => {
    const root = await project()
    const server = await startServer(root)

    const response = await fetch(`${server.base}/api/marketplace/items`)
    expect(response.status).toBe(403)
  })
})
