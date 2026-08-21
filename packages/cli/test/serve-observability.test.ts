import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `GET /api/observability` (fiche L22 task 5) against a real server: the
 * admin's "Exploitation" > Observability screen reads this. No collections
 * needed — this screen is about the process, not the content.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-observability-'))
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

interface ObservabilityBody {
  readonly data: {
    readonly enabled: boolean
    readonly traces: readonly {
      readonly method: string | undefined
      readonly path: string | undefined
      readonly statusCode: number | undefined
      readonly durationMs: number
      readonly ok: boolean
    }[]
    readonly logs: readonly { readonly level: string; readonly msg: string }[]
  }
}

describe('cogenta serve — /api/observability', () => {
  it('refuses an anonymous and a non-admin caller', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const anonymous = await fetch(`${server.base}/api/observability`)
      expect(anonymous.status).toBe(403)
      await anonymous.arrayBuffer()

      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const asEditor = await fetch(`${server.base}/api/observability`, {
        headers: { authorization: `Bearer ${editorToken}` },
      })
      expect(asEditor.status).toBe(403)
      await asEditor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('is on by default and records a real request as a trace, query string stripped', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)

      const probe = await fetch(`${server.base}/api/health-report?secret=do-not-leak`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(probe.status).toBe(200)
      await probe.arrayBuffer()

      const response = await fetch(`${server.base}/api/observability`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as ObservabilityBody
      expect(body.data.enabled).toBe(true)

      const healthTrace = body.data.traces.find((trace) => trace.path === '/api/health-report')
      expect(healthTrace).toBeDefined()
      expect(healthTrace?.method).toBe('GET')
      expect(healthTrace?.statusCode).toBe(200)
      expect(healthTrace?.ok).toBe(true)
      expect(healthTrace?.durationMs).toBeGreaterThanOrEqual(0)

      // The query string — which just carried a fake secret — never reaches
      // any trace, anywhere in the response.
      expect(JSON.stringify(body.data)).not.toContain('do-not-leak')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('records the bearer token header nowhere in the response', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)

      await (
        await fetch(`${server.base}/api/health-report`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).arrayBuffer()

      const response = await fetch(`${server.base}/api/observability`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const body = (await response.json()) as ObservabilityBody
      expect(JSON.stringify(body.data)).not.toContain(token)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('reflects observability.enabled being turned off, without a restart', async () => {
    const root = await project()
    const server = await startServer(root, {
      registry: activeServers,
      observabilitySettingsTickMs: 50,
    })
    try {
      const token = await adminToken(root, server.base)

      const before = await fetch(`${server.base}/api/observability`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(((await before.json()) as ObservabilityBody).data.enabled).toBe(true)

      const write = await fetch(`${server.base}/api/settings`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'observability.enabled', value: false }),
      })
      expect(write.status).toBe(200)
      await write.arrayBuffer()

      // Wait past the (shortened) settings-refresh interval — no restart.
      await new Promise((resolve) => setTimeout(resolve, 300))

      const after = await fetch(`${server.base}/api/observability`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(((await after.json()) as ObservabilityBody).data.enabled).toBe(false)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('stops growing the trace buffer once disabled', async () => {
    const root = await project()
    const server = await startServer(root, {
      registry: activeServers,
      observabilitySettingsTickMs: 50,
    })
    try {
      const token = await adminToken(root, server.base)

      await (
        await fetch(`${server.base}/api/settings`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'observability.enabled', value: false }),
        })
      ).arrayBuffer()
      await new Promise((resolve) => setTimeout(resolve, 300))

      const snapshot = await fetch(`${server.base}/api/observability`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const before = ((await snapshot.json()) as ObservabilityBody).data.traces.length

      await (
        await fetch(`${server.base}/api/error-log`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).arrayBuffer()

      // Both the probe above and this very read happened while disabled — the
      // buffer must not have grown, and the probed path must not appear.
      const after = await fetch(`${server.base}/api/observability`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const afterBody = ((await after.json()) as ObservabilityBody).data
      expect(afterBody.traces).toHaveLength(before)
      expect(afterBody.traces.some((trace) => trace.path === '/api/error-log')).toBe(false)
    } finally {
      await server.stop()
    }
  }, 60_000)
})
