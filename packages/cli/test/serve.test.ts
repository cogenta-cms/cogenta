import { createHmac } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Independent RFC 6238 implementation — see packages/auth/test/helpers/totp-code.ts for why. */
function codeFor(secret: string, nowSeconds: number): string {
  const normalised = secret.toUpperCase().replace(/=+$/u, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of normalised) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  const key = Buffer.from(bytes)

  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(nowSeconds / 30)))
  const digest = createHmac('sha1', key).update(counter).digest()
  const offset = (digest.at(-1) ?? 0) & 0x0f
  const truncated =
    ((digest[offset] ?? 0) & 0x7f) * 2 ** 24 +
    ((digest[offset + 1] ?? 0) & 0xff) * 2 ** 16 +
    ((digest[offset + 2] ?? 0) & 0xff) * 2 ** 8 +
    ((digest[offset + 3] ?? 0) & 0xff)
  return String(truncated % 1_000_000).padStart(6, '0')
}

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

/**
 * Signs in a user whose role can publish, completing the mandatory TOTP
 * enrolment along the way (roles that can publish are always MFA-sensitive
 * — see `packages/auth/src/mfa.ts` — so login never returns a session on
 * the first call for one of them). Returns the bearer token.
 */
async function loginWithMfaSetup(base: string, email: string, password: string): Promise<string> {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const loginBody = (await login.json()) as { data: { status: string; ticket: string } }
  if (loginBody.data.status !== 'totp_setup_required') {
    throw new Error(`expected totp_setup_required, got ${loginBody.data.status}`)
  }

  const setup = await fetch(`${base}/api/auth/totp-setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticket: loginBody.data.ticket }),
  })
  const setupBody = (await setup.json()) as { data: { secret: string } }

  const confirmed = await fetch(`${base}/api/auth/totp-setup-confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ticket: loginBody.data.ticket,
      token: codeFor(setupBody.data.secret, Date.now() / 1000),
    }),
  })
  const confirmedBody = (await confirmed.json()) as { data: { session: { token: string } } }
  return confirmedBody.data.session.token
}

const activeServers: AbortController[] = []

async function startServer(
  root: string,
  options: { readonly readOnly?: boolean } = {},
): Promise<{ base: string; stop: () => Promise<void> }> {
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
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
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

  it('read-only mode: reads still work, a real write is refused with CONTENT_READ_ONLY', async () => {
    const root = await project()
    const server = await startServer(root, { readOnly: true })
    try {
      const { createSqliteHandle } = await import('@cogenta/core')
      const { createUserStore, createCredentialStore, ensureAuthTables } = await import(
        '@cogenta/auth'
      )
      const db = await createSqliteHandle({ url: join(root, 'site.db') })
      await ensureAuthTables(db)
      const users = createUserStore(db)
      const credentials = createCredentialStore(db)
      const user = await users.create({ email: 'editor@example.com', roles: ['editor'] })
      await credentials.setPassword(user.id, 'correct horse battery staple')
      await db.close()

      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )

      // Reads are unaffected by read-only mode.
      const read = await fetch(`${server.base}/api/content/article`)
      expect(read.status).toBe(200)

      // A real, permitted write attempt is refused, not silently accepted.
      const write = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ values: { title: 'Should not be saved' } }),
      })
      expect(write.status).toBe(403)
      const writeBody = (await write.json()) as { error: { code: string } }
      expect(writeBody.error.code).toBe('CONTENT_READ_ONLY')

      // Nothing landed: the collection is still empty.
      const after = await fetch(`${server.base}/api/content/article`)
      const afterBody = (await after.json()) as { data: unknown[] }
      expect(afterBody.data).toEqual([])
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

  it("mints a preview link that unlocks a draft's working state for an anonymous reader", async () => {
    const root = await project()
    const server = await startServer(root)
    const savedKey = process.env['COGENTA_PREVIEW_SIGNING_KEY']
    process.env['COGENTA_PREVIEW_SIGNING_KEY'] = 'e'.repeat(64)
    try {
      const { createSqliteHandle } = await import('@cogenta/core')
      const { createUserStore, createCredentialStore, ensureAuthTables } = await import(
        '@cogenta/auth'
      )
      const db = await createSqliteHandle({ url: join(root, 'site.db') })
      await ensureAuthTables(db)
      const users = createUserStore(db)
      const credentials = createCredentialStore(db)
      const user = await users.create({ email: 'admin@example.com', roles: ['editor'] })
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
      // `editor` can publish `article`, so login stops at MFA enrolment
      // rather than a session (the rule is not configurable — ADR/MFA
      // policy) — complete it the same way a first-time editor would.
      const loginBody = (await login.json()) as { data: { status: string; ticket: string } }
      expect(loginBody.data.status).toBe('totp_setup_required')

      const setup = await fetch(`${server.base}/api/auth/totp-setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: loginBody.data.ticket }),
      })
      const setupBody = (await setup.json()) as { data: { secret: string } }

      const confirmed = await fetch(`${server.base}/api/auth/totp-setup-confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ticket: loginBody.data.ticket,
          token: codeFor(setupBody.data.secret, Date.now() / 1000),
        }),
      })
      const confirmedBody = (await confirmed.json()) as { data: { session: { token: string } } }
      const auth = { authorization: `Bearer ${confirmedBody.data.session.token}` }

      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ values: { title: 'A draft only editors can see' } }),
      })
      const createdBody = (await created.json()) as { data: { id: string; status: string } }
      expect(createdBody.data.status).toBe('draft')

      const minted = await fetch(
        `${server.base}/api/content/article/${createdBody.data.id}/preview`,
        { method: 'POST', headers: auth },
      )
      expect(minted.status).toBe(201)
      const mintedBody = (await minted.json()) as {
        data: { token: string; path: string | null; url: string | null }
      }
      expect(typeof mintedBody.data.token).toBe('string')
      // The `article` collection declares no route, so there is no page URL
      // to build — only the token, which the id-based read below still uses.
      expect(mintedBody.data.path).toBeNull()

      const previewed = await fetch(
        `${server.base}/api/content/article/${createdBody.data.id}?state=working&preview=${encodeURIComponent(mintedBody.data.token)}`,
      )
      expect(previewed.status).toBe(200)
      const previewedBody = (await previewed.json()) as { data: { id: string } }
      expect(previewedBody.data.id).toBe(createdBody.data.id)

      // The same request with no token at all is refused outright: a public
      // reader has no working-state rights, preview or not.
      const withoutToken = await fetch(
        `${server.base}/api/content/article/${createdBody.data.id}?state=working`,
      )
      expect(withoutToken.status).toBe(403)
    } finally {
      if (savedKey === undefined) delete process.env['COGENTA_PREVIEW_SIGNING_KEY']
      else process.env['COGENTA_PREVIEW_SIGNING_KEY'] = savedKey
      await server.stop()
    }
  })

  it('uploads, lists and reads back a media asset over /api/media', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
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
      const loginBody = (await login.json()) as { data: { session: { token: string } } }
      const auth = { authorization: `Bearer ${loginBody.data.session.token}` }

      // A 1x1 transparent PNG — real magic bytes, so the server's own
      // real-type check (not just its route wiring) is exercised.
      const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

      const uploaded = await fetch(`${server.base}/api/media`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({
          kind: 'image',
          filename: 'cover.png',
          mimeType: 'image/png',
          data: png,
          alt: 'A single transparent pixel',
        }),
      })
      expect(uploaded.status).toBe(201)
      const uploadedBody = (await uploaded.json()) as { data: { id: string; alt: string } }
      expect(uploadedBody.data.alt).toBe('A single transparent pixel')

      const listed = await fetch(`${server.base}/api/media`, { headers: auth })
      expect(listed.status).toBe(200)
      const listedBody = (await listed.json()) as { data: unknown[] }
      expect(listedBody.data).toHaveLength(1)

      const read = await fetch(`${server.base}/api/media/${uploadedBody.data.id}`, {
        headers: auth,
      })
      expect(read.status).toBe(200)

      const file = await fetch(`${server.base}/api/media/${uploadedBody.data.id}/file`, {
        headers: auth,
      })
      expect(file.status).toBe(200)
      expect(file.headers.get('content-type')).toBe('image/png')
      expect(Buffer.from(await file.arrayBuffer()).toString('base64')).toBe(png)

      const anonymousFile = await fetch(`${server.base}/api/media/${uploadedBody.data.id}/file`)
      expect(anonymousFile.status).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it('records logins and content writes in the audit log, readable only by admin', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const { createSqliteHandle } = await import('@cogenta/core')
      const { createUserStore, createCredentialStore, ensureAuthTables } = await import(
        '@cogenta/auth'
      )
      const db = await createSqliteHandle({ url: join(root, 'site.db') })
      await ensureAuthTables(db)
      const users = createUserStore(db)
      const credentials = createCredentialStore(db)
      const editor = await users.create({ email: 'editor@example.com', roles: ['editor'] })
      await credentials.setPassword(editor.id, 'correct horse battery staple')
      const admin = await users.create({ email: 'admin@example.com', roles: ['admin'] })
      await credentials.setPassword(admin.id, 'correct horse battery staple')
      await db.close()

      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${editorToken}` },
        body: JSON.stringify({ values: { title: 'Audited article' } }),
      })

      const adminToken = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )
      const auditHeaders = { authorization: `Bearer ${adminToken}` }

      const asEditor = await fetch(`${server.base}/api/audit`, {
        headers: { authorization: `Bearer ${editorToken}` },
      })
      expect(asEditor.status).toBe(403)

      const asAdmin = await fetch(`${server.base}/api/audit`, { headers: auditHeaders })
      expect(asAdmin.status).toBe(200)
      const entries = (await asAdmin.json()) as {
        data: { action: string; actorId: string | null }[]
      }
      const actions = entries.data.map((entry) => entry.action)
      expect(actions).toContain('content.create')
      expect(actions.filter((action) => action === 'auth.login').length).toBeGreaterThanOrEqual(2)

      const verify = await fetch(`${server.base}/api/audit/verify`, { headers: auditHeaders })
      expect(verify.status).toBe(200)
      expect(((await verify.json()) as { data: { ok: boolean } }).data.ok).toBe(true)
    } finally {
      await server.stop()
    }
  })

  it('reports database and storage health, admin-only', async () => {
    const root = await project()
    const server = await startServer(root)
    try {
      const { createSqliteHandle } = await import('@cogenta/core')
      const { createUserStore, createCredentialStore, ensureAuthTables } = await import(
        '@cogenta/auth'
      )
      const db = await createSqliteHandle({ url: join(root, 'site.db') })
      await ensureAuthTables(db)
      const users = createUserStore(db)
      const credentials = createCredentialStore(db)
      const admin = await users.create({ email: 'admin@example.com', roles: ['admin'] })
      await credentials.setPassword(admin.id, 'correct horse battery staple')
      await db.close()

      const anonymous = await fetch(`${server.base}/api/health`)
      expect(anonymous.status).toBe(403)

      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct horse battery staple',
      )
      const response = await fetch(`${server.base}/api/health`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: {
          database: { status: string; driver: string }
          storage: { status: string; driver: string }
        }
      }
      // SQLite and local storage are this project's degraded tier (R1) — a
      // working install reports "degraded", not "ok", and that is the
      // correct, expected reading rather than a fault.
      expect(body.data.database.status).not.toBe('down')
      expect(body.data.storage.status).not.toBe('down')
      expect(body.data.database.driver).toBe('sqlite')
      expect(body.data.storage.driver).toBe('local')
    } finally {
      await server.stop()
    }
  })
})

describe('the theme stylesheet', () => {
  it('serves one cacheable sheet, without asking who is reading it', async () => {
    const server = await startServer(await project())
    try {
      const response = await fetch(`${server.base}/_cogenta/styles.css`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/css')

      const css = await response.text()
      // One marker per layer of `theme.css`, so a lost `@import` fails here as
      // well as in the theme's own tests.
      expect(css).toContain('--cg-canvas')
      expect(css).toContain('.cg-skip-link')
      expect(css).toContain('.cg-hero__title')
      // The skin's generated custom properties travel in the same sheet.
      expect(css).toContain('--cogenta-color-accent')
    } finally {
      await server.stop()
    }
  })

  it('answers a repeat visit with 304 rather than the whole sheet again', async () => {
    const server = await startServer(await project())
    try {
      const first = await fetch(`${server.base}/_cogenta/styles.css`)
      const etag = first.headers.get('etag')
      expect(etag).not.toBeNull()
      await first.text()

      const second = await fetch(`${server.base}/_cogenta/styles.css`, {
        headers: { 'if-none-match': etag as string },
      })
      expect(second.status).toBe(304)
      expect(await second.text()).toBe('')
    } finally {
      await server.stop()
    }
  })

  it('refuses a method that has no meaning for a stylesheet', async () => {
    const server = await startServer(await project())
    try {
      const response = await fetch(`${server.base}/_cogenta/styles.css`, { method: 'POST' })
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('GET')
    } finally {
      await server.stop()
    }
  })
})

/**
 * A page with a real block zone, seeded straight into the store the server
 * reads from, then fetched over HTTP. The point is the seam nothing else
 * covers: that the document `cogenta serve` writes around `renderPage` is a
 * whole page — a skip link, a landmark, a link to the stylesheet — and not a
 * bare `<main>`.
 */
async function themedProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-theme-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Themed site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `import { defineCollection, f } from '@cogenta/schema'

export default [
  defineCollection({
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      blocks: f.blocks({ required: true }),
    },
    indexes: [['slug']],
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  }),
]
`,
    'utf8',
  )
  return root
}

describe('a themed page over HTTP', () => {
  it('serves a whole document, not just the rendered blocks', async () => {
    const root = await themedProject()
    // Seeded before the server starts: `createSchemaTables` runs at assembly,
    // so the tables have to exist first — which they do, because this handle
    // creates them through the same code path the server uses.
    const { createSqliteHandle } = await import('@cogenta/core')
    const { createContentStore, createSchemaTables, defineCollection, f } = await import(
      '@cogenta/schema'
    )
    const page = defineCollection({
      name: 'page',
      labels: { singular: 'Page', plural: 'Pages' },
      routing: { pattern: '/:slug' },
      fields: {
        title: f.text({ required: true, max: 200 }),
        slug: f.slug({ from: 'title', unique: true }),
        blocks: f.blocks({ required: true }),
      },
      indexes: [['slug']],
      permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
    })
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    await createSchemaTables(db, [page])
    await createContentStore({ db, collection: page, defaultLocale: 'en' }).create({
      status: 'published',
      createdBy: null,
      values: { title: 'Home', slug: 'home' },
      blocks: {
        blocks: [
          {
            key: 'hero',
            type: 'hero',
            data: { title: 'Two planes, one site', eyebrow: 'Demo' },
          },
        ],
      },
    })
    await db.close()

    const server = await startServer(root)
    try {
      const response = await fetch(`${server.base}/`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')

      const html = await response.text()
      // The block itself.
      expect(html).toContain('Two planes, one site')
      expect(html).toContain('cg-hero__eyebrow')
      // The document around it — none of which existed before L12.
      expect(html).toContain(`<link rel="stylesheet" href="/_cogenta/styles.css">`)
      expect(html).toContain('<meta name="color-scheme" content="light dark">')
      expect(html).toContain('class="cg-skip-link"')
      expect(html).toContain('class="cg-site-header"')
      expect(html).toContain('Themed site')
      // Still no client JavaScript anywhere on the page.
      expect(html).not.toMatch(/<script/i)
    } finally {
      await server.stop()
    }
  })
})
