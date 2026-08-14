import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-serve-'))
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
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
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
    env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
    logger: createLogger({ level: 'silent' }),
    out: createOutput(() => undefined, false),
    stderr: () => undefined,
    port: 0,
    signal: controller.signal,
    onListening: (a) => resolveAddress(a),
  })
  // If startup fails before ever listening, `address` would hang forever —
  // race it against the command's own exit so that case fails fast instead.
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

describe('runServe', () => {
  it('refuses to start without COGENTA_AUTH_SIGNING_KEY', async () => {
    const root = await project()
    const errors: string[] = []
    const code = await runServe({
      cwd: root,
      env: {},
      out: createOutput(() => undefined, false),
      stderr: (text) => errors.push(text),
      port: 0,
    })
    expect(code).toBe(1)
    expect(errors.join('')).toContain('COGENTA_AUTH_SIGNING_KEY')
  })

  it('serves a public read over REST with no session at all', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const response = await fetch(`${server.base}/api/content/article`)
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: unknown[] }
      expect(body.data).toEqual([])
    } finally {
      await server.stop()
    }
  })

  it('answers a GraphQL query', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const response = await fetch(`${server.base}/api/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: { __typename: string } }
      expect(body.data.__typename).toBe('Query')
    } finally {
      await server.stop()
    }
  })

  it('logs in and reaches an authenticated route with the returned token', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      // Bootstrap a user the same way `cogenta users create` would, straight
      // against the site's own database file — the server owns that
      // connection, so this goes through the HTTP surface instead.
      const { createSqliteHandle } = await import('@cogenta/core')
      const { createUserStore, createCredentialStore, ensureAuthTables } = await import(
        '@cogenta/auth'
      )
      const db = await createSqliteHandle({ url: join(root, 'site.db') })
      await ensureAuthTables(db)
      const users = createUserStore(db)
      const credentials = createCredentialStore(db)
      const user = await users.create({ email: 'admin@example.com', roles: ['viewer'] })
      await credentials.setPassword(user.id, 'correct horse battery staple')
      await db.close()

      const login = await fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'correct horse battery staple',
        }),
      })
      expect(login.status).toBe(200)
      const loginBody = (await login.json()) as {
        data: { status: string; session: { token: string } }
      }
      expect(loginBody.data.status).toBe('session')

      const session = await fetch(`${server.base}/api/auth/session`, {
        headers: { authorization: `Bearer ${loginBody.data.session.token}` },
      })
      expect(session.status).toBe(200)
      const sessionBody = (await session.json()) as { data: { email: string } }
      expect(sessionBody.data.email).toBe('admin@example.com')
    } finally {
      await server.stop()
    }
  })

  it('answers 404 for a path no route owns', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const response = await fetch(`${server.base}/nonexistent`)
      expect(response.status).toBe(404)
    } finally {
      await server.stop()
    }
  })

  it('configures WebAuthn from site.url, so passkey login options resolve', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const response = await fetch(`${server.base}/api/auth/webauthn/login/begin`, {
        method: 'POST',
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: { options: { rpId: string } } }
      // project()'s cogenta.config.mjs sets site.url to https://example.com.
      expect(body.data.options.rpId).toBe('example.com')
    } finally {
      await server.stop()
    }
  })

  it('serves schema.json, with permissions, for the admin to read', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const response = await fetch(`${server.base}/api/schema`)
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: { collections: readonly { name: string; permissions: Record<string, string[]> }[] }
      }
      const article = body.data.collections.find((c) => c.name === 'article')
      expect(article?.permissions.create).toEqual(['editor'])
    } finally {
      await server.stop()
    }
  })

  it('refuses a non-GET method on /api/schema', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const response = await fetch(`${server.base}/api/schema`, { method: 'POST' })
      expect(response.status).toBe(405)
    } finally {
      await server.stop()
    }
  })
})
