import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { verifyIncomingWebhook } from '@cogenta/channels'
import { createSqliteHandle, sql } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Fiche 21, end to end over a real running server and a real SQLite file —
 * never `:memory:`, since the point of tasks 3 and 5 is what survives a
 * restart and what a direct database edit does.
 */

const WEBHOOK_SECRET = 'a-real-shared-webhook-secret-for-audit-tests'

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    // `admin` is granted `update` too, alongside `editor`: real sites
    // usually do, and this suite's audit-detail test wants to show a
    // working diff, not the "no-permission-on-collection" degradation
    // (which has its own unit test in @cogenta/api).
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor', 'admin'],
      publish: ['editor'],
    },
  },
]

interface Received {
  readonly timestamp: string
  readonly signature: string
  readonly rawBody: string
}

interface Receiver {
  readonly url: string
  readonly received: Received[]
  close(): Promise<void>
}

async function startReceiver(): Promise<Receiver> {
  const received: Received[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      received.push({
        timestamp: String(req.headers['x-cogenta-timestamp'] ?? ''),
        signature: String(req.headers['x-cogenta-signature'] ?? ''),
        rawBody: Buffer.concat(chunks).toString('utf8'),
      })
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('receiver has no port')
  return {
    url: `http://127.0.0.1:${address.port}/hook`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

/**
 * Returns the project root — `database.url` always points at `{root}/site.db`,
 * the same file `createUser` and a test's own direct-DB tamper open, so
 * there is exactly one file in play, never two temp directories that
 * happen to share a name.
 */
async function project(endpoints: readonly string[] = []): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-audit-e2e-'))
  const dbPath = join(root, 'site.db')
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(dbPath)} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  webhooks: { endpoints: ${JSON.stringify(endpoints)} },
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
const openReceivers: Receiver[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  for (const receiver of openReceivers.splice(0)) await receiver.close()
})

interface Notice {
  readonly id: string
  readonly severity: string
}

async function notices(base: string, token: string): Promise<readonly Notice[]> {
  const response = await fetch(`${base}/api/notices`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { data: Notice[] }
  return body.data
}

describe('cogenta serve — audit log detail and export (fiche 21 tasks 1/2)', () => {
  it('shows what an update actually changed, without leaving the audit screen', async () => {
    const site = await project()
    const server = await startServer(site, { registry: activeServers })
    try {
      await createUser(site, 'editor@example.com', 'correct-horse-battery-staple', ['editor'])
      await createUser(site, 'admin@example.com', 'correct-horse-battery-staple', ['admin'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct-horse-battery-staple',
      )
      const adminToken = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct-horse-battery-staple',
      )
      const editorHeaders = {
        'content-type': 'application/json',
        authorization: `Bearer ${editorToken}`,
      }
      const adminHeaders = { authorization: `Bearer ${adminToken}` }

      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: editorHeaders,
        body: JSON.stringify({ values: { title: 'Before' } }),
      })
      expect(created.status).toBe(201)
      const entry = (await created.json()) as { data: { id: string } }

      const updated = await fetch(`${server.base}/api/content/article/${entry.data.id}`, {
        method: 'PATCH',
        headers: editorHeaders,
        body: JSON.stringify({ values: { title: 'After' } }),
      })
      expect(updated.status).toBe(200)

      const list = await fetch(
        `${server.base}/api/audit?action=content.update&collection=article`,
        { headers: adminHeaders },
      )
      const listBody = (await list.json()) as { data: { id: string }[] }
      expect(listBody.data.length).toBeGreaterThan(0)
      const auditId = listBody.data[0]?.id

      const detail = await fetch(`${server.base}/api/audit/${auditId}`, { headers: adminHeaders })
      expect(detail.status).toBe(200)
      const detailBody = (await detail.json()) as {
        data: {
          actorKind: string
          diff: { fields: { field: string; before: unknown; after: unknown }[] } | null
        }
      }
      expect(detailBody.data.actorKind).toBe('human')
      expect(detailBody.data.diff).not.toBeNull()
      const titleChange = detailBody.data.diff?.fields.find((f) => f.field === 'title')
      expect(titleChange).toMatchObject({ before: 'Before', after: 'After' })
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('restricts the export to admin, and journals the export itself', async () => {
    const site = await project()
    const server = await startServer(site, { registry: activeServers })
    try {
      await createUser(site, 'admin@example.com', 'correct-horse-battery-staple', ['admin'])
      await createUser(site, 'editor@example.com', 'correct-horse-battery-staple', ['editor'])
      const adminToken = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct-horse-battery-staple',
      )
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct-horse-battery-staple',
      )

      const refused = await fetch(`${server.base}/api/audit/export`, {
        headers: { authorization: `Bearer ${editorToken}` },
      })
      expect(refused.status).toBe(403)
      await refused.arrayBuffer()

      const csv = await fetch(`${server.base}/api/audit/export?format=csv`, {
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(csv.status).toBe(200)
      expect(csv.headers.get('content-type')).toContain('text/csv')
      const csvText = await csv.text()
      expect(csvText.split('\r\n')[0]).toContain('actorKind')

      // The export is itself a journalled, personal-data-extracting event
      // (fiche 21 task 2) — never the exported rows themselves.
      const afterExport = await fetch(`${server.base}/api/audit?action=audit.export`, {
        headers: { authorization: `Bearer ${adminToken}` },
      })
      const afterExportBody = (await afterExport.json()) as {
        data: { diff: Record<string, unknown> | null }[]
      }
      expect(afterExportBody.data.length).toBeGreaterThan(0)
      expect(afterExportBody.data[0]?.diff).toMatchObject({ format: 'csv' })
    } finally {
      await server.stop()
    }
  }, 30_000)
})

describe('cogenta serve — distinguishing agent and machine actions (fiche 21 task 4)', () => {
  it('separates an api-key action from a human one in the actorKind filter', async () => {
    const site = await project()
    const server = await startServer(site, { registry: activeServers })
    try {
      await createUser(site, 'admin@example.com', 'correct-horse-battery-staple', ['admin'])
      const adminToken = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct-horse-battery-staple',
      )
      const adminHeaders = {
        'content-type': 'application/json',
        authorization: `Bearer ${adminToken}`,
      }

      const key = await fetch(`${server.base}/api/api-keys`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ name: 'ci-bot', scope: ['editor'] }),
      })
      expect(key.status).toBe(201)
      const keyBody = (await key.json()) as { data: { key: string } }

      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${keyBody.data.key}`,
        },
        body: JSON.stringify({ values: { title: 'Written by a key' } }),
      })
      expect(created.status).toBe(201)

      const byKey = await fetch(`${server.base}/api/audit?actorKind=api_key`, {
        headers: adminHeaders,
      })
      const byKeyBody = (await byKey.json()) as { data: { action: string }[] }
      expect(byKeyBody.data.some((e) => e.action === 'content.create')).toBe(true)

      const byHuman = await fetch(`${server.base}/api/audit?actorKind=human&action=apikey.create`, {
        headers: adminHeaders,
      })
      const byHumanBody = (await byHuman.json()) as { data: unknown[] }
      expect(byHumanBody.data.length).toBe(1) // the admin creating the key, a human action
    } finally {
      await server.stop()
    }
  }, 30_000)
})

describe('cogenta serve — scheduled audit integrity check (fiche 21 task 3)', () => {
  /**
   * This is the test that gives the feature its value. Not the "verify now"
   * button — a row is altered directly in the database, exactly the way a
   * compromised or buggy process would, and nobody ever calls
   * `/api/audit/verify` or `POST /api/audit/integrity`. The alert has to
   * arrive from the scheduled tick alone.
   */
  it('alerts on its own after a row is altered directly in the database, with no button pressed', async () => {
    const receiver = await startReceiver()
    openReceivers.push(receiver)
    const site = await project([receiver.url])
    const dbPath = join(site, 'site.db')
    const server = await startServer(site, {
      registry: activeServers,
      env: { COGENTA_WEBHOOK_SECRET: WEBHOOK_SECRET },
      auditIntegrityTickMs: 100,
    })
    try {
      await createUser(site, 'admin@example.com', 'correct-horse-battery-staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct-horse-battery-staple',
      )

      // Nothing looks broken yet.
      expect((await notices(server.base, token)).map((n) => n.id)).not.toContain(
        'security.audit-integrity-broken',
      )

      // Let a few ticks pass so the sign-in above is past a checkpoint —
      // real time, on a real file, exactly what "survives a restart" means.
      await sleep(500)

      // The tamper: a raw UPDATE against the site's own SQLite file, the
      // same file `cogenta serve` is reading from right now. No API call.
      const direct = await createSqliteHandle({ url: dbPath })
      await direct.query(
        sql`update cogenta_audit_log set action = ${'tampered'} where action = ${'auth.login'}`,
      )
      await direct.close()

      // Nothing has been clicked. The only thing that can find this now is
      // the next scheduled tick.
      let found: Notice | undefined
      for (let attempt = 0; attempt < 20 && found === undefined; attempt += 1) {
        await sleep(150)
        found = (await notices(server.base, token)).find(
          (n) => n.id === 'security.audit-integrity-broken',
        )
      }
      expect(found).toBeDefined()
      expect(found?.severity).toBe('danger')

      // And the outbound channel — one alert, signed, naming the break.
      expect(receiver.received.length).toBeGreaterThan(0)
      const call = receiver.received[0]
      expect(call).toBeDefined()
      if (call === undefined) return
      expect(
        verifyIncomingWebhook({
          headers: { timestamp: call.timestamp, signature: call.signature },
          rawBody: call.rawBody,
          secret: WEBHOOK_SECRET,
        }),
      ).toEqual({ ok: true })
      const envelope = JSON.parse(call.rawBody) as { event: string; data: Record<string, unknown> }
      expect(envelope.event).toBe('security.audit_integrity_broken')
      expect(envelope.data.severity).toBe('critical')

      // Only ever one alert for one break, however many ticks pass after it.
      const countAfterFirstFound = receiver.received.length
      await sleep(400)
      expect(receiver.received.length).toBe(countAfterFirstFound)
    } finally {
      await server.stop()
    }
  }, 30_000)

  it('reports the last check on GET /api/audit/integrity without running a new one', async () => {
    const site = await project()
    const server = await startServer(site, { registry: activeServers, auditIntegrityTickMs: 100 })
    try {
      await createUser(site, 'admin@example.com', 'correct-horse-battery-staple', ['admin'])
      const token = await loginWithMfaSetup(
        server.base,
        'admin@example.com',
        'correct-horse-battery-staple',
      )
      await sleep(300)

      const status = await fetch(`${server.base}/api/audit/integrity`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(status.status).toBe(200)
      const body = (await status.json()) as {
        data: { state: string; lastCheckedAt: string | null }
      }
      expect(body.data.state).toBe('ok')
      expect(body.data.lastCheckedAt).not.toBeNull()
    } finally {
      await server.stop()
    }
  }, 30_000)
})
