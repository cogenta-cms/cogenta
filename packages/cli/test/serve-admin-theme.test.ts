import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L21 task 2, end to end against a real `cogenta serve` on a real SQLite
 * database: `GET /api/admin-theme` never needs a session, `PUT` needs
 * `admin` specifically (not merely a session), and an unknown template or a
 * declared-but-invalid override is refused rather than silently accepted.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-admin-theme-e2e-'))
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

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

interface AdminThemeBody {
  readonly data: {
    readonly active: { readonly templateId: string; readonly overrides: Record<string, unknown> }
    readonly templates: readonly { readonly id: string }[]
  }
}

describe('cogenta serve — GET|PUT /api/admin-theme (L21 task 2)', () => {
  it('reads with no session at all, and names both built-in templates', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const response = await fetch(`${server.base}/api/admin-theme`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as AdminThemeBody
    expect(body.data.active.templateId).toBe('nightops')
    expect(body.data.templates.map((template) => template.id).sort()).toEqual([
      'atelier',
      'nightops',
    ])
  })

  it('refuses a write from a signed-in editor, allows one from admin, and the choice sticks', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })

    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const editorToken = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const refused = await fetch(`${server.base}/api/admin-theme`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${editorToken}` },
      body: JSON.stringify({ templateId: 'atelier', overrides: {} }),
    })
    expect(refused.status).toBe(403)

    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const adminToken = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const written = await fetch(`${server.base}/api/admin-theme`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ templateId: 'atelier', overrides: { primaryColor: '#c23d0a' } }),
    })
    expect(written.status).toBe(200)

    const read = await fetch(`${server.base}/api/admin-theme`)
    const body = (await read.json()) as AdminThemeBody
    expect(body.data.active.templateId).toBe('atelier')
    expect(body.data.active.overrides['primaryColor']).toBe('#c23d0a')
  })

  it('refuses an unknown template id and an undeclared override, both from admin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })

    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const badTemplate = await fetch(`${server.base}/api/admin-theme`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ templateId: 'midnight-neon', overrides: {} }),
    })
    expect(badTemplate.status).toBe(400)

    const badOverride = await fetch(`${server.base}/api/admin-theme`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ templateId: 'nightops', overrides: { headerHeightPx: 64 } }),
    })
    expect(badOverride.status).toBe(400)
  })
})
