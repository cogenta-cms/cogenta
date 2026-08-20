import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `GET /api/tools`, `POST /api/tools/{id}/run`, `GET /api/tools/runs/{id}`
 * (fiche 24 task 3) against a real server.
 *
 * `scheduledPublishTickMs` is set short so the tools queue — which rides the
 * same tick as scheduled publication — drains within the test's own
 * lifetime; this is the exact queue whose degraded (database) driver is on
 * trial here (no Redis anywhere in this suite, R1).
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-tools-'))
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

interface RunBody {
  readonly data: {
    readonly status: 'queued' | 'running' | 'completed' | 'failed'
    readonly log: readonly string[]
    readonly error: string | undefined
  }
}

async function waitForRun(base: string, token: string, id: string): Promise<RunBody['data']> {
  const deadline = Date.now() + 20_000
  for (;;) {
    const response = await fetch(`${base}/api/tools/runs/${id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = (await response.json()) as RunBody
    if (body.data.status === 'completed' || body.data.status === 'failed') return body.data
    if (Date.now() > deadline) throw new Error(`Run ${id} never finished: ${body.data.status}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

describe('cogenta serve — /api/tools', () => {
  it('lists the seven maintenance tools', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, scheduledPublishTickMs: 200 })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/tools`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: { tools: readonly { id: string }[] } }
      expect(body.data.tools.map((tool) => tool.id).sort()).toEqual(
        [
          'check-links',
          'purge-cache',
          'purge-trash',
          'regenerate-images',
          'reindex-search',
          'reindex-vectors',
          'test-email',
        ].sort(),
      )
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('runs "purge trash" through the queue and reports completion, not inline', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, scheduledPublishTickMs: 200 })
    try {
      const token = await adminToken(root, server.base)
      const started = await fetch(`${server.base}/api/tools/purge-trash/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{}',
      })
      // 202, not 200: the tool has not run yet when this response is sent.
      expect(started.status).toBe(202)
      const { data } = (await started.json()) as { data: { id: string } }

      const finished = await waitForRun(server.base, token, data.id)
      expect(finished.status).toBe('completed')
      expect(finished.log.join('\n')).toContain('Done.')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('runs "check links" and finds the site has nothing broken with no content', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, scheduledPublishTickMs: 200 })
    try {
      const token = await adminToken(root, server.base)
      const started = await fetch(`${server.base}/api/tools/check-links/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{}',
      })
      const { data } = (await started.json()) as { data: { id: string } }
      const finished = await waitForRun(server.base, token, data.id)
      expect(finished.status).toBe('completed')
      expect(finished.log.join('\n')).toContain('Nothing broken.')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('sends a real test email through the file transport, and reports the exact failure without one', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, scheduledPublishTickMs: 200 })
    try {
      const token = await adminToken(root, server.base)

      const withoutEmail = await fetch(`${server.base}/api/tools/test-email/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{}',
      })
      const { data: idOnly } = (await withoutEmail.json()) as { data: { id: string } }
      const failed = await waitForRun(server.base, token, idOnly.id)
      expect(failed.status).toBe('failed')
      expect(failed.error).toBeTruthy()

      const withEmail = await fetch(`${server.base}/api/tools/test-email/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ops@example.com' }),
      })
      const { data: idWithEmail } = (await withEmail.json()) as { data: { id: string } }
      const sent = await waitForRun(server.base, token, idWithEmail.id)
      expect(sent.status).toBe('completed')
      expect(sent.log.join('\n')).toContain('ops@example.com')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses an unknown tool with 404, and a non-admin with 403', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, scheduledPublishTickMs: 200 })
    try {
      const token = await adminToken(root, server.base)
      const unknown = await fetch(`${server.base}/api/tools/not-a-real-tool/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{}',
      })
      expect(unknown.status).toBe(404)
      await unknown.arrayBuffer()

      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const asEditor = await fetch(`${server.base}/api/tools/purge-trash/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${editorToken}`, 'content-type': 'application/json' },
        body: '{}',
      })
      expect(asEditor.status).toBe(403)
      await asEditor.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})
