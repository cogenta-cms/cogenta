import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * Contract E's back office (ADR-0024), wired into a real `cogenta serve` for
 * the first time. `@cogenta/commerce`'s own suite proves the store logic;
 * this file proves only that `/api/commerce` is actually reachable, that its
 * own permission vocabulary (`commerce.*`, never contract A's five actions)
 * is enforced by a real server, and that a product created through it is
 * immediately listable and sellable through the same router — the same
 * pattern `serve-marketplace.test.ts` and `serve-taxonomies-trash.test.ts`
 * already use for their own routers.
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-commerce-'))

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

describe('the shop, end to end', () => {
  it('answers an admin with the empty catalog, real router and real tables', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])

    const response = await fetch(`${server.base}/api/commerce/products`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { products: unknown[] }
    expect(body.products).toEqual([])
  })

  it('lists a product created through the admin router, with its variant and stock', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['admin'])
    const authHeaders = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    }

    const createProduct = await fetch(`${server.base}/api/commerce/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ handle: 'wool-jumper', title: 'Wool jumper' }),
    })
    expect(createProduct.status).toBe(201)
    const product = (await createProduct.json()) as { id: string }

    const createVariant = await fetch(
      `${server.base}/api/commerce/products/${product.id}/variants`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          sku: 'WOOL-JUMPER-M',
          title: 'Medium',
          priceMinor: 4500,
          currency: 'EUR',
          onHand: 12,
        }),
      },
    )
    expect(createVariant.status).toBe(201)

    // Listable: what an admin screen renders as the product table.
    const list = await fetch(`${server.base}/api/commerce/products`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const listBody = (await list.json()) as {
      products: readonly { id: string; handle: string; title: string }[]
    }
    expect(listBody.products).toHaveLength(1)
    expect(listBody.products[0]).toMatchObject({ handle: 'wool-jumper', title: 'Wool jumper' })

    // Sellable: the variant, its price in minor units, and its stock are all
    // reachable through the same router — what an order would be placed
    // against.
    const read = await fetch(`${server.base}/api/commerce/products/${product.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const readBody = (await read.json()) as {
      variants: readonly { sku: string; priceMinor: number; onHand: number }[]
    }
    expect(readBody.variants).toHaveLength(1)
    expect(readBody.variants[0]).toMatchObject({
      sku: 'WOOL-JUMPER-M',
      priceMinor: 4500,
      onHand: 12,
    })
  })

  it('refuses an actor without catalog-write, never a UI-only gate', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['viewer'])

    const response = await fetch(`${server.base}/api/commerce/products`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ handle: 'x', title: 'X' }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses an anonymous request, telling "sign in" apart from "not allowed"', async () => {
    const root = await project()
    const server = await startServer(root)

    const response = await fetch(`${server.base}/api/commerce/products`)
    expect(response.status).toBe(401)
  })
})
