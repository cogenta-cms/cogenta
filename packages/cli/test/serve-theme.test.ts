import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
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

/**
 * `/api/theme` (fiche 14), end to end over a real `cogenta serve`/`cogenta
 * dev`. The site here has **no LLM provider**, deliberately, the same
 * discipline `serve-site-plan.test.ts` follows: the appearance screen must
 * work in full without one (R2), and only the AI section's absence needs
 * proving here.
 */

const FILE_TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f1f2f4',
    mutedFg: '#4b5057',
    border: '#d7dade',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, SFMono-Regular, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '2px', md: '6px', lg: '12px' },
  motion: { duration: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.06)', md: '0 6px 20px rgba(0, 0, 0, 0.12)' },
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-theme-e2e-'))
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
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    join(root, 'theme.tokens.json'),
    `${JSON.stringify(FILE_TOKENS, null, 2)}\n`,
    'utf8',
  )
  return root
}

/** Publishes a "home" page so `/` (and this suite's preview requests) resolve to a real document. Content creation needs `editor`, distinct from the `admin` session every theme route needs. */
async function seedHomePage(root: string, base: string): Promise<void> {
  await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
  const editorToken = await loginWithMfaSetup(base, 'editor@example.com', 'correct-horse-battery')
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${editorToken}` }
  const created = (await (
    await fetch(`${base}/api/content/page`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ values: { title: 'Home', slug: 'home' } }),
    })
  ).json()) as { data: { id: string } }
  await fetch(`${base}/api/content/page/${created.data.id}/publish`, { method: 'POST', headers })
}

const activeServers: AbortController[] = []
afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function adminSession(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct-horse-battery')
}

async function editorSession(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct-horse-battery', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct-horse-battery')
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

describe('GET /api/theme', () => {
  it('reports the file tokens and says the AI section and export are unavailable', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    const body = (await response.json()) as {
      data: { fileTokens: unknown; aiAvailable: boolean; exportAvailable: boolean }
    }

    expect(response.status).toBe(200)
    expect(body.data.fileTokens).toEqual(FILE_TOKENS)
    expect(body.data.aiAvailable).toBe(false)
    expect(body.data.exportAvailable).toBe(false)
    await server.stop()
  }, 60_000)

  it('refuses a non-admin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await editorSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    expect(response.status).toBe(403)
    await server.stop()
  }, 60_000)
})

describe('PUT /api/theme/overrides and its hot-swap into the served stylesheet', () => {
  it('saves an override and the public stylesheet reflects it on the very next request', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const before = await fetch(`${server.base}/_cogenta/styles.css`)
    const beforeCss = await before.text()
    expect(beforeCss).toContain('#1d4ed8')

    const put = await fetch(`${server.base}/api/theme/overrides`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ tokenOverrides: { color: { accent: '#c2410c' } } }),
    })
    expect(put.status).toBe(200)

    const after = await fetch(`${server.base}/_cogenta/styles.css`)
    const afterCss = await after.text()
    expect(afterCss).toContain('#c2410c')
    expect(afterCss).not.toContain('#1d4ed8')

    await server.stop()
  }, 60_000)

  it('refuses an override that would fail contract D contrast, and does not persist it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/overrides`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ tokenOverrides: { color: { fg: '#fefefe' } } }),
    })
    expect(response.status).toBe(422)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('SKIN_CONTRAST_INSUFFICIENT')

    const getAfter = await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    const getBody = (await getAfter.json()) as { data: { overrides: { tokenOverrides: unknown } } }
    expect(getBody.data.overrides.tokenOverrides).toBeNull()

    await server.stop()
  }, 60_000)

  it('serves additional CSS as part of the stylesheet, never as an inline <style> tag', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    await seedHomePage(root, server.base)
    await fetch(`${server.base}/api/theme/overrides`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ additionalCss: '.hand-written{color:pink}' }),
    })

    const css = await (await fetch(`${server.base}/_cogenta/styles.css`)).text()
    expect(css).toContain('.hand-written')

    const home = await fetch(`${server.base}/home`)
    expect(home.status).toBe(200)
    const html = await home.text()
    expect(html).not.toContain('<style')

    await server.stop()
  }, 60_000)
})

describe('POST /api/theme/preview', () => {
  it('renders the real home page with a candidate token overlay, without saving it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)
    await seedHomePage(root, server.base)

    const response = await fetch(`${server.base}/api/theme/preview`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ tokens: { color: { accent: '#7c3aed' } } }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { html: string } }
    expect(body.data.html).toContain('#7c3aed')

    const getAfter = await fetch(`${server.base}/api/theme`, { headers: auth(token) })
    const getBody = (await getAfter.json()) as { data: { overrides: { tokenOverrides: unknown } } }
    expect(getBody.data.overrides.tokenOverrides).toBeNull()

    await server.stop()
  }, 60_000)

  it('refuses a preview candidate that fails contract D, the same way a save would', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/preview`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ tokens: { color: { fg: '#fefefe' } } }),
    })
    expect(response.status).toBe(422)
    await server.stop()
  }, 60_000)

  it('refuses a non-admin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await editorSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/preview`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(403)
    await server.stop()
  }, 60_000)
})

describe('POST /api/theme/export (development only, ADR-0010 mirrored)', () => {
  it('refuses on cogenta serve (not development)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/export`, {
      method: 'POST',
      headers: auth(token),
    })
    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('THEME_EXPORT_NOT_ALLOWED')
    await server.stop()
  }, 60_000)

  it('writes the effective merged tokens to theme.tokens.json under cogenta dev', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, development: true })
    const token = await adminSession(root, server.base)

    await fetch(`${server.base}/api/theme/overrides`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ tokenOverrides: { color: { accent: '#065f46' } } }),
    })
    const response = await fetch(`${server.base}/api/theme/export`, {
      method: 'POST',
      headers: auth(token),
    })
    expect(response.status).toBe(200)

    const written = JSON.parse(await readFile(join(root, 'theme.tokens.json'), 'utf8')) as {
      color: { accent: string }
    }
    expect(written.color.accent).toBe('#065f46')

    await server.stop()
  }, 60_000)
})

describe('GET /api/theme/skins — the accepted-skin gallery', () => {
  it('starts empty on a fresh site, honestly, rather than pretending there is a catalog', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminSession(root, server.base)

    const response = await fetch(`${server.base}/api/theme/skins`, { headers: auth(token) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: readonly unknown[] }
    expect(body.data).toEqual([])
    await server.stop()
  }, 60_000)
})
