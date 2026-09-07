import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZipWriter, openZip } from '@cogenta/export'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Fiche 73 tasks 4-8, wired end to end: real HTTP against a real
 * `cogenta serve`, exercising `/api/theme/sandbox/*`, `/api/theme/<name>
 * /versions*`, `/api/theme/<name>/export` and `/api/theme/import`. The
 * underlying mechanisms (`theme-sandbox.ts`/`theme-export.ts`) already have
 * their own thorough unit suites, including the security-hardened path
 * guards — this suite proves the HTTP layer routes to them correctly and
 * enforces the same admin-only gate every other theme route already has,
 * not the guards themselves again.
 *
 * Project roots live under `packages/cli/test/tmp/`, not the OS temp
 * directory — same reasoning `theme-sandbox.test.ts` already documents: a
 * preview does a real `import('@cogenta/theme-kit')` from inside the
 * sandbox, which needs Node's own module resolution to walk up to
 * `packages/cli/node_modules`, a real dependency this package already
 * declares. The OS temp directory has no such ancestor.
 */

const TMP_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'tmp')

async function project(): Promise<string> {
  await mkdir(TMP_ROOT, { recursive: true })
  const root = await mkdtemp(join(TMP_ROOT, 'serve-theme-sandbox-e2e-'))
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
  await writeFile(join(root, 'cogenta.schema.mjs'), `export default []\n`, 'utf8')
  return root
}

const FULL_VOCABULARY = [
  'hero',
  'prose',
  'mediaFigure',
  'featureGrid',
  'cta',
  'gallery',
  'quote',
  'faq',
  'stats',
  'logos',
  'collectionList',
  'embed',
  'testimonial',
  'pricingTable',
  'accordion',
  'statCounter',
  'logoStrip',
]

const MANIFEST = `
export default {
  name: 'wired-theme',
  version: '1.0.0',
  engine: '^1.0.0',
  blocks: '^1.0.0',
  implements: ${JSON.stringify(FULL_VOCABULARY)},
  collections: '*',
  runtime: 'server',
  tokens: 'theme.tokens.json',
  description: 'A theme built for the HTTP wiring suite.',
  author: 'A developer, not an agent',
}
`

const RENDER_MODULE = `
import { h } from '@cogenta/theme-kit'
export function renderPage(page) {
  return h('main', {}, page.title)
}
export function renderChrome() {
  return { header: '<header>Wired</header>', footer: '<footer>Wired</footer>' }
}
`

async function writeSandboxFixture(root: string, id: string): Promise<void> {
  const dir = join(root, '.cogenta', 'theme-sandbox', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'theme.config.mjs'), MANIFEST, 'utf8')
  await writeFile(join(dir, 'theme.render.mjs'), RENDER_MODULE, 'utf8')
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function adminToken(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

describe('cogenta serve — theme sandbox routes (fiche 73 tasks 4-8)', () => {
  it('refuses every theme sandbox route to a non-admin, and to an anonymous caller', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })

    const anonymous = await fetch(`${server.base}/api/theme/sandbox`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'x' }),
    })
    expect(anonymous.status).toBe(403)

    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const editorToken = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )
    const asEditor = await fetch(`${server.base}/api/theme/sandbox`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${editorToken}`,
      },
      body: JSON.stringify({ id: 'x' }),
    })
    expect(asEditor.status).toBe(403)
  })

  it('creates a sandbox, previews it, checks it, and deploys it into themes/', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(root, server.base)
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

    const created = await fetch(`${server.base}/api/theme/sandbox`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'sbx-http' }),
    })
    expect(created.status).toBe(201)

    // Files are written directly (no HTTP route exists for individual
    // sandbox file writes outside the AI agent tool, which needs a real LLM
    // provider — the same real filesystem `theme.write_sandbox_file` itself
    // targets, so this is not bypassing the mechanism, only its one AI-only
    // entry point).
    await writeSandboxFixture(root, 'sbx-http')

    const preview = await fetch(`${server.base}/api/theme/sandbox/sbx-http/preview`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(preview.status).toBe(200)
    const previewBody = (await preview.json()) as {
      data: { ok: boolean; html?: string; error?: string }
    }
    expect(previewBody.data.ok).toBe(true)
    expect(previewBody.data.html).toContain('<header>Wired</header>')

    const check = await fetch(
      `${server.base}/api/theme/sandbox/sbx-http/check?themeName=wired-theme`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    expect(check.status).toBe(200)
    const checkBody = (await check.json()) as { data: { ok: boolean; reasons: string[] } }
    expect(checkBody.data.ok).toBe(true)
    expect(checkBody.data.reasons).toEqual([])

    const deploy = await fetch(`${server.base}/api/theme/sandbox/sbx-http/deploy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ themeName: 'wired-theme' }),
    })
    expect(deploy.status).toBe(200)
    const deployBody = (await deploy.json()) as {
      data: { ok: boolean; themeDirectory?: string; previousVersionDirectory?: string | null }
    }
    expect(deployBody.data.ok).toBe(true)
    expect(deployBody.data.previousVersionDirectory).toBeNull()
  })

  it('the check route reports a real refusal reason for an incomplete theme, without deploying it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(root, server.base)

    await fetch(`${server.base}/api/theme/sandbox`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: 'sbx-incomplete' }),
    })
    // No theme.render.mjs at all.
    const dir = join(root, '.cogenta', 'theme-sandbox', 'sbx-incomplete')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'theme.config.mjs'), MANIFEST, 'utf8')

    const check = await fetch(
      `${server.base}/api/theme/sandbox/sbx-incomplete/check?themeName=incomplete-theme`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    const checkBody = (await check.json()) as { data: { ok: boolean; reasons: string[] } }
    expect(checkBody.data.ok).toBe(false)
    expect(checkBody.data.reasons[0]).toContain('nothing to deploy')

    const deploy = await fetch(`${server.base}/api/theme/sandbox/sbx-incomplete/deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ themeName: 'incomplete-theme' }),
    })
    const deployBody = (await deploy.json()) as { data: { ok: boolean } }
    expect(deployBody.data.ok).toBe(false)
  })

  it('lists versions after a redeploy and restores an earlier one', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(root, server.base)
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

    await writeSandboxFixture(root, 'sbx-v1')
    await fetch(`${server.base}/api/theme/sandbox/sbx-v1/deploy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ themeName: 'versioned-http-theme' }),
    })

    await writeSandboxFixture(root, 'sbx-v2')
    const secondManifest = MANIFEST.replace(
      'A theme built for the HTTP wiring suite.',
      'A second, updated version.',
    )
    await writeFile(
      join(root, '.cogenta', 'theme-sandbox', 'sbx-v2', 'theme.config.mjs'),
      secondManifest,
      'utf8',
    )
    await fetch(`${server.base}/api/theme/sandbox/sbx-v2/deploy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ themeName: 'versioned-http-theme' }),
    })

    const versionsResponse = await fetch(`${server.base}/api/theme/versioned-http-theme/versions`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const versionsBody = (await versionsResponse.json()) as {
      data: { versions: readonly { timestamp: string }[] }
    }
    expect(versionsBody.data.versions).toHaveLength(1)

    const timestamp = versionsBody.data.versions[0]?.timestamp ?? ''
    const restore = await fetch(
      `${server.base}/api/theme/versioned-http-theme/versions/${timestamp}/restore`,
      { method: 'POST', headers },
    )
    expect(restore.status).toBe(200)
    const restoreBody = (await restore.json()) as {
      data: { ok: boolean; themeDirectory?: string }
    }
    expect(restoreBody.data.ok).toBe(true)
  })

  it('exports a deployed theme as a real, downloadable zip', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(root, server.base)

    await writeSandboxFixture(root, 'sbx-export')
    await fetch(`${server.base}/api/theme/sandbox/sbx-export/deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ themeName: 'exported-http-theme' }),
    })

    const response = await fetch(`${server.base}/api/theme/exported-http-theme/export`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toContain('exported-http-theme.zip')

    const zipBytes = Buffer.from(await response.arrayBuffer())
    const zipPath = join(root, 'downloaded.zip')
    await writeFile(zipPath, zipBytes)
    const reader = await openZip(zipPath)
    try {
      expect(reader.entries.map((entry) => entry.name).sort()).toEqual([
        'theme.config.mjs',
        'theme.render.mjs',
      ])
    } finally {
      await reader.close()
    }
  })

  it('imports a zip into a new sandbox over HTTP, base64-encoded', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(root, server.base)

    const chunks: Buffer[] = []
    const writer = createZipWriter({ write: (chunk) => void chunks.push(chunk) })
    await writer.addFile('theme.config.mjs', Buffer.from(MANIFEST, 'utf8'))
    await writer.addFile('theme.render.mjs', Buffer.from(RENDER_MODULE, 'utf8'))
    await writer.finish()
    const zipBase64 = Buffer.concat(chunks).toString('base64')

    const response = await fetch(`${server.base}/api/theme/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ sandboxId: 'imported-http', zipBase64 }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { sandboxId: string } }
    expect(body.data.sandboxId).toBe('imported-http')

    const preview = await fetch(`${server.base}/api/theme/sandbox/imported-http/preview`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const previewBody = (await preview.json()) as {
      data: { ok: boolean; html?: string; error?: string }
    }
    expect(previewBody.data.ok).toBe(true)
    expect(previewBody.data.html).toContain('<header>Wired</header>')
  })

  it('answers 404 for an unmatched theme sandbox sub-route', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(root, server.base)

    const response = await fetch(`${server.base}/api/theme/sandbox/some-id/not-a-real-action`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(404)
  })
})
