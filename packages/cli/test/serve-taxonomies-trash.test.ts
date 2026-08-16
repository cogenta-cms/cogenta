import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * The trash and taxonomies of `schema@2.0` (ADR-0022), end to end through a
 * real `cogenta serve` — a real HTTP server, a real SQLite file, a real
 * session.
 *
 * The unit suites of `@cogenta/schema` and `@cogenta/api` prove the pieces.
 * This one proves they are actually *wired*: that a taxonomy declared in a
 * project's schema file reaches `/api/taxonomies`, that its terms classify
 * real content, and that deleting an entry over HTTP puts it somewhere it can
 * be recovered from instead of destroying it.
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-tax-'))

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

  // A named `taxonomies` export beside the default one — the convention that
  // keeps every pre-2.0 schema file loading unchanged.
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export const taxonomies = [
  {
    name: 'topic',
    labels: { singular: { en: 'Topic' } },
    hierarchical: true,
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
]

export default [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      topics: { kind: 'taxonomy', options: { of: 'topic', many: true } },
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

/**
 * Creates an account with the given roles and returns its bearer token.
 *
 * Bootstrapped straight through the auth store, the same way the other serve
 * tests do it — `cogenta users create` is a separate command with its own
 * suite, and going through it here would test that instead of this.
 */
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

describe('taxonomies and the trash, end to end', () => {
  it('serves the declared taxonomy, classifies content with it, and trashes reversibly', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['editor', 'admin'])
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    // The schema document tells the admin both halves of 2.0 exist.
    const schema = (await (await fetch(`${server.base}/api/schema`)).json()) as {
      data: {
        contract: string
        taxonomies: { name: string }[]
        collections: { name: string; trash: unknown }[]
      }
    }
    expect(schema.data.contract).toBe('schema@2.0')
    expect(schema.data.taxonomies.map((entry) => entry.name)).toEqual(['topic'])
    expect(schema.data.collections[0]?.trash).toEqual({ retainDays: 30 })

    // A term, created through the real route.
    const created = await fetch(`${server.base}/api/taxonomies/topic`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ slug: 'cuisine', labels: { en: 'Cooking' } }),
    })
    expect(created.status).toBe(201)
    const term = ((await created.json()) as { data: { id: string; depth: number } }).data
    expect(term.depth).toBe(0)

    // A child of it, so the tree is real and not a single row.
    const child = await fetch(`${server.base}/api/taxonomies/topic`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ slug: 'desserts', labels: { en: 'Desserts' }, parent: term.id }),
    })
    expect(((await child.json()) as { data: { depth: number } }).data.depth).toBe(1)

    // Content classified by that term, through the ordinary content route:
    // the join table exists because `createSchemaTables` made it.
    const entry = await fetch(`${server.base}/api/content/article`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ values: { title: 'Tarte Tatin', topics: [term.id] } }),
    })
    expect(entry.status).toBe(201)
    const article = ((await entry.json()) as { data: { id: string } }).data

    const read = await fetch(`${server.base}/api/content/article/${article.id}?state=working`, {
      headers: auth,
    })
    const readBody = (await read.json()) as { data: { values: { topics: string[] } } }
    expect(readBody.data.values.topics).toEqual([term.id])

    // DELETE now means "to the trash", and the entry is still there.
    const deleted = await fetch(`${server.base}/api/content/article/${article.id}`, {
      method: 'DELETE',
      headers: auth,
    })
    expect(deleted.status).toBe(204)

    const gone = await fetch(`${server.base}/api/content/article/${article.id}?state=working`, {
      headers: auth,
    })
    expect(gone.status).toBe(404)

    const trash = await fetch(`${server.base}/api/content/article?state=working&trashed=only`, {
      headers: auth,
    })
    const trashBody = (await trash.json()) as { data: { id: string; deletedAt: string }[] }
    expect(trashBody.data.map((item) => item.id)).toEqual([article.id])
    expect(trashBody.data[0]?.deletedAt).not.toBeNull()

    // And it comes back, with its classification intact — the reason the
    // trash keeps every row rather than moving one.
    const restored = await fetch(`${server.base}/api/content/article/${article.id}/untrash`, {
      method: 'POST',
      headers: auth,
    })
    expect(restored.status).toBe(200)
    const restoredBody = (await restored.json()) as {
      data: { deletedAt: string | null; values: { topics: string[] } }
    }
    expect(restoredBody.data.deletedAt).toBeNull()
    expect(restoredBody.data.values.topics).toEqual([term.id])

    await server.stop()
  })

  it('refuses a taxonomy write to an actor without the action, over HTTP', async () => {
    const root = await project()
    const server = await startServer(root)
    const viewerToken = await signIn(root, server.base, ['viewer'])

    // `topic` grants create to `editor` and `admin` only. The runtime checks
    // it (R4), not the screen that happens not to show the button.
    const refused = await fetch(`${server.base}/api/taxonomies/topic`, {
      method: 'POST',
      headers: { authorization: `Bearer ${viewerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'nope', labels: { en: 'Nope' } }),
    })
    expect(refused.status).toBe(403)

    // Reading is open to `public`, so the same actor still gets the tree.
    const listed = await fetch(`${server.base}/api/taxonomies/topic`, {
      headers: { authorization: `Bearer ${viewerToken}` },
    })
    expect(listed.status).toBe(200)

    await server.stop()
  })
})
