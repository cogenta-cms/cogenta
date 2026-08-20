import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `/api/import/analyze` and `/api/import/runs/*`, end to end (fiche 25): the
 * preview/apply/status/undo flow against a real running server, a real
 * SQLite database, and the site's own declared collection — unlike
 * `serve-import.test.ts`'s WordPress route, which writes into the
 * importer's own fixed collections, this exercises the generic CSV engine
 * against `page`, the collection this project's `cogenta.schema.mjs`
 * actually declares.
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
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-import-preview-e2e-'))
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

describe('POST /api/import/analyze + /api/import/runs/* (CSV, preview/apply/undo)', () => {
  it('previews a CSV without writing anything, then applies it, then cancels it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(root, server.base)
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const csv = 'title\nFirst page\nSecond page\n'
    const analyzeResponse = await fetch(`${server.base}/api/import/analyze`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        source: 'csv',
        filename: 'pages.csv',
        data: Buffer.from(csv, 'utf8').toString('base64'),
        targetCollection: 'page',
      }),
    })
    expect(analyzeResponse.status).toBe(200)
    const analyzed = (await analyzeResponse.json()) as {
      data: { id: string; status: string; analysis: { totalRecords: number } }
    }
    expect(analyzed.data.status).toBe('analyzed')
    expect(analyzed.data.analysis.totalRecords).toBe(2)
    const runId = analyzed.data.id

    // Nothing was written by analyze alone.
    const beforeApply = await fetch(`${server.base}/api/content/page?state=working`, {
      headers: auth,
    })
    const beforeBody = (await beforeApply.json()) as { data: readonly unknown[] }
    expect(beforeBody.data).toHaveLength(0)

    const applyResponse = await fetch(`${server.base}/api/import/runs/${runId}/apply`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({}),
    })
    expect(applyResponse.status).toBe(200)
    const applied = (await applyResponse.json()) as {
      data: { status: string; report: { imported: number } }
    }
    expect(applied.data.status).toBe('done')
    expect(applied.data.report.imported).toBe(2)

    const statusResponse = await fetch(`${server.base}/api/import/runs/${runId}`, { headers: auth })
    const status = (await statusResponse.json()) as { data: { status: string } }
    expect(status.data.status).toBe('done')

    const listResponse = await fetch(`${server.base}/api/import/runs`, { headers: auth })
    const list = (await listResponse.json()) as { data: readonly { id: string }[] }
    expect(list.data.some((run) => run.id === runId)).toBe(true)

    // Undo: trashes what the run created.
    const cancelResponse = await fetch(`${server.base}/api/import/runs/${runId}/cancel`, {
      method: 'POST',
      headers: auth,
    })
    expect(cancelResponse.status).toBe(200)
    const cancelled = (await cancelResponse.json()) as { data: { status: string } }
    expect(cancelled.data.status).toBe('cancelled')

    const afterCancel = await fetch(`${server.base}/api/content/page?state=working`, {
      headers: auth,
    })
    const afterBody = (await afterCancel.json()) as { data: readonly unknown[] }
    expect(afterBody.data).toHaveLength(0)

    await server.stop()
  })

  it('refuses an editor on every import route', async () => {
    const root = await project()
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const server = await startServer(root, { registry: activeServers })
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const analyzeResponse = await fetch(`${server.base}/api/import/analyze`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        source: 'csv',
        filename: 'x.csv',
        data: Buffer.from('title\na\n', 'utf8').toString('base64'),
      }),
    })
    expect(analyzeResponse.status).toBe(403)

    const listResponse = await fetch(`${server.base}/api/import/runs`, { headers: auth })
    expect(listResponse.status).toBe(403)

    await server.stop()
  })

  it('resumes an apply without duplicating already-imported rows', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const token = await adminToken(root, server.base)
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const csv = 'title\nOnly page\n'
    const analyzeResponse = await fetch(`${server.base}/api/import/analyze`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        source: 'csv',
        filename: 'pages.csv',
        data: Buffer.from(csv, 'utf8').toString('base64'),
        targetCollection: 'page',
      }),
    })
    const { data: run } = (await analyzeResponse.json()) as { data: { id: string } }

    const first = await fetch(`${server.base}/api/import/runs/${run.id}/apply`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({}),
    })
    expect(
      ((await first.json()) as { data: { report: { imported: number } } }).data.report.imported,
    ).toBe(1)

    // Same runId, applied again — simulating a resumed apply after an
    // interruption. Nothing is duplicated.
    const second = await fetch(`${server.base}/api/import/runs/${run.id}/apply`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({}),
    })
    const secondBody = (await second.json()) as {
      data: { report: { imported: number; resumedSkips: number } }
    }
    expect(secondBody.data.report.imported).toBe(0)
    expect(secondBody.data.report.resumedSkips).toBe(1)

    const list = await fetch(`${server.base}/api/content/page?state=working`, { headers: auth })
    const listBody = (await list.json()) as { data: readonly unknown[] }
    expect(listBody.data).toHaveLength(1)

    await server.stop()
  })
})
