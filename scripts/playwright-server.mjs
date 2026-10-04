import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Each official browser run owns an ephemeral site and database. It never
// reads a developer site's credentials, content or configured AI providers.
await new Promise((resolve, reject) => {
  const build = spawn('corepack', ['pnpm', 'run', 'build', '--filter=@cogenta/cli...'], {
    stdio: 'inherit',
  })
  build.once('error', reject)
  build.once('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`E2E build failed (${code}).`)),
  )
})

const { createLogger, createSqliteHandle, sql } = await import('../packages/core/dist/index.js')
const { createCredentialStore, createUserStore } = await import('../packages/auth/dist/index.js')
const { createMenuStore } = await import('../packages/schema/dist/index.js')
const { runServe, createOutput } = await import('../packages/cli/dist/index.js')
const logger = createLogger({ level: 'error' })
const BROWSER_FIXTURE_PASSWORD = 'browser-fixture-password-2026'
const root = await mkdtemp(join(tmpdir(), 'cogenta-browser-'))
const port = Number(process.env.COGENTA_E2E_PORT ?? 4660)
const metadataPath = join(process.cwd(), '.cogenta', 'e2e-fixture.json')
await writeFile(metadataPath, JSON.stringify({ root }))
const controller = new AbortController()
const fields = {
  title: { kind: 'text', required: true, options: { max: 200 }, admin: { label: 'Titre' } },
  slug: { kind: 'slug', required: true, options: { from: 'title' } },
  intro: { kind: 'richText', options: {} },
  body: { kind: 'richText', options: {} },
}
const permissions = {
  read: ['public', 'viewer', 'editor', 'admin'],
  create: ['editor'],
  update: ['editor'],
  delete: ['admin'],
  publish: ['editor'],
}
await writeFile(
  join(root, 'cogenta.config.mjs'),
  `export default ${JSON.stringify({
    site: {
      name: 'Cogenta browser fixture',
      url: `http://127.0.0.1:${port}`,
      locales: ['fr', 'en'],
      defaultLocale: 'fr',
    },
    database: { url: join(root, 'site.db') },
    cache: { path: join(root, 'cache') },
    storage: { path: join(root, 'media') },
    vector: { path: join(root, 'vectors') },
  })}`,
)
await writeFile(
  join(root, 'cogenta.schema.mjs'),
  `export default ${JSON.stringify([
    {
      name: 'page',
      labels: { singular: 'Page', plural: 'Pages' },
      routing: { pattern: '/:slug' },
      versioning: { drafts: true, history: true },
      fields,
      permissions,
    },
    {
      name: 'article',
      labels: { singular: 'Article', plural: 'Articles' },
      routing: { pattern: '/articles/:slug' },
      versioning: { drafts: true, history: true },
      workflow: { enabled: true },
      fields,
      permissions: { ...permissions, publish: ['admin'] },
    },
  ])}`,
)

let ready
const listening = new Promise((resolve) => {
  ready = resolve
})
let stopped = false
const stop = () => {
  stopped = true
  controller.abort()
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
const running = runServe({
  cwd: root,
  port,
  env: { COGENTA_AUTH_SIGNING_KEY: 'browser-fixture-signing-key-not-a-secret' },
  logger,
  out: createOutput(() => undefined, false),
  stderr: () => undefined,
  signal: controller.signal,
  onListening: ready,
  updatesFetchImpl: async () => new Response('offline browser fixture', { status: 503 }),
  embedsFetchImpl: async () => new Response('offline browser fixture', { status: 503 }),
})
try {
  await Promise.race([
    listening,
    running.then(() => {
      throw new Error('E2E server stopped before listening.')
    }),
  ])
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  try {
    const users = createUserStore(db)
    const credentials = createCredentialStore(db)
    const menus = createMenuStore({ db })
    const legacy = await menus.create({
      name: 'legacy-security',
      label: 'Navigation héritée',
      locale: 'fr',
      location: 'primary',
    })
    for (const [index, scheme] of [
      'javascript:window.__cogenta_menu_injection=1',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ].entries()) {
      const item = await menus.createItem(legacy.id, {
        kind: 'url',
        label: `Ancienne destination ${index}`,
        url: '/',
      })
      // Simulate data persisted before the write guard existed, using the real database.
      await db.query(sql`update cogenta_menu_items set url = ${scheme} where id = ${item.id}`)
    }
    await menus.createItem(legacy.id, {
      kind: 'url',
      label: 'Destination héritée sûre',
      url: '/qa-e2e-ready',
    })
    for (const role of ['admin', 'editor', 'viewer']) {
      const user = await users.create({
        email: `${role}@e2e.example.test`,
        roles: role === 'admin' ? ['admin', 'editor'] : [role],
      })
      await credentials.setPassword(user.id, BROWSER_FIXTURE_PASSWORD)
    }
  } finally {
    await db.close()
  }
  const origin = `http://127.0.0.1:${port}`
  const loggedIn = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@e2e.example.test',
      password: BROWSER_FIXTURE_PASSWORD,
    }),
  })
  if (!loggedIn.ok) throw new Error('E2E administrator could not sign in.')
  const {
    data: {
      session: { token },
    },
  } = await loggedIn.json()
  for (const slug of ['home', 'qa-e2e-ready']) {
    const seeded = await fetch(`${origin}/api/content/page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status: 'published',
        values: { title: 'Cogenta browser fixture', slug, intro: [], body: [] },
      }),
    })
    if (!seeded.ok) throw new Error(`E2E page fixture failed (${seeded.status}).`)
  }
  await running
  if (!stopped) throw new Error('E2E server exited unexpectedly.')
} finally {
  controller.abort()
  await running
  await rm(root, { recursive: true, force: true })
  await rm(metadataPath, { force: true })
}
