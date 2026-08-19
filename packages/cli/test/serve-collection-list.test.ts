import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * Fiche 01 ("Liste de contenu"), task 3's own end-to-end requirement: "contre
 * un vrai serveur, publier deux entrées par action groupée et vérifier en
 * base qu'elles sont published". A bulk action in the admin is nothing more
 * than one `POST .../publish` per selected row (`Promise.allSettled`) — this
 * proves that real sequence against a real HTTP server and a real SQLite
 * file, the same way `serve-taxonomies-trash.test.ts` proves the trash.
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-collist-'))

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
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      publishedAt: { kind: 'datetime', options: {} },
    },
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

/** Bootstrapped straight through the auth store — the same way the other serve tests do it. */
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

describe("the collection list screen's bulk publish, end to end", () => {
  it('publishes two entries selected together, and the store shows both published', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['editor'])
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const created = await Promise.all(
      ['First draft', 'Second draft'].map(async (title) => {
        const response = await fetch(`${server.base}/api/content/article`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ values: { title } }),
        })
        const body = (await response.json()) as { data: { id: string } }
        return body.data.id
      }),
    )
    expect(created).toHaveLength(2)

    // Exactly what the admin's bulk action does: one POST per selected row,
    // `Promise.allSettled` so one refusal cannot lose the others' outcome.
    const results = await Promise.allSettled(
      created.map((id) =>
        fetch(`${server.base}/api/content/article/${id}/publish`, {
          method: 'POST',
          headers: auth,
        }),
      ),
    )
    for (const result of results) {
      expect(result.status).toBe('fulfilled')
      if (result.status === 'fulfilled') expect(result.value.status).toBe(200)
    }

    for (const id of created) {
      const response = await fetch(`${server.base}/api/content/article/${id}?state=working`, {
        headers: auth,
      })
      const body = (await response.json()) as { data: { status: string } }
      expect(body.data.status).toBe('published')
    }

    await server.stop()
  })

  it('reports which of a mixed selection failed, without losing the ones that succeeded', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['editor'])
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const real = await fetch(`${server.base}/api/content/article`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ values: { title: 'Real entry' } }),
    })
    const realId = ((await real.json()) as { data: { id: string } }).data.id
    const missingId = 'does-not-exist'

    const results = await Promise.allSettled(
      [realId, missingId].map(async (id) => {
        const response = await fetch(`${server.base}/api/content/article/${id}/publish`, {
          method: 'POST',
          headers: auth,
        })
        if (!response.ok) throw new Error(`publish failed for ${id}`)
        return response
      }),
    )

    expect(results[0]?.status).toBe('fulfilled')
    expect(results[1]?.status).toBe('rejected')

    const check = await fetch(`${server.base}/api/content/article/${realId}?state=working`, {
      headers: auth,
    })
    expect(((await check.json()) as { data: { status: string } }).data.status).toBe('published')

    await server.stop()
  })
})
