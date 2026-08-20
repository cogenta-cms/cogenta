import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDoctor } from '../src/commands/doctor.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `GET /api/health-report` and friends (fiche 24 tasks 1, 2, 4) against a
 * real server — no collections needed, this screen is about the process,
 * not the content.
 *
 * The load-bearing assertion is the first one: the acceptance criterion is
 * literally "le diagnostic de l'admin est le même code que `cogenta
 * doctor`", so this compares the HTTP response against `runDoctor` called
 * directly against the same project, not against a hand-written fixture.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-health-'))
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

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function adminToken(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

describe('cogenta serve — /api/health-report', () => {
  it('answers exactly what runDoctor returns for the same project', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/health-report`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: { checks: readonly { need: string; driver: string }[]; site: { name: string } }
      }

      const direct = await runDoctor({
        cwd: root,
        env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
      })

      // The site name and every driver check line up with the standalone
      // `cogenta doctor` run against the same project — the two describe the
      // same reality because they are the same function.
      expect(body.data.site.name).toBe(direct.site?.name)
      expect(body.data.checks.map((check) => `${check.need}:${check.driver}`).sort()).toEqual(
        direct.checks.map((check) => `${check.need}:${check.driver}`).sort(),
      )
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses an anonymous and a non-admin caller', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const anonymous = await fetch(`${server.base}/api/health-report`)
      expect(anonymous.status).toBe(403)
      await anonymous.arrayBuffer()

      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const asEditor = await fetch(`${server.base}/api/health-report`, {
        headers: { authorization: `Bearer ${editorToken}` },
      })
      expect(asEditor.status).toBe(403)
      await asEditor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('reports no pending migrations on a fresh project with none written', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/migrations-status`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: { items: readonly unknown[] } }
      expect(body.data.items).toEqual([])

      const applied = await fetch(`${server.base}/api/migrations-apply`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(applied.status).toBe(200)
      const appliedBody = (await applied.json()) as {
        data: { applied: readonly string[]; remainingDestructive: readonly string[] }
      }
      expect(appliedBody.data).toEqual({ applied: [], remainingDestructive: [] })
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('reports the audit chain as intact on a fresh install', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/audit-integrity`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: { ok: boolean } }
      expect(body.data.ok).toBe(true)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('starts with an empty error log', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/error-log`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: { entries: readonly unknown[] } }
      expect(body.data.entries).toEqual([])
    } finally {
      await server.stop()
    }
  }, 60_000)
})
