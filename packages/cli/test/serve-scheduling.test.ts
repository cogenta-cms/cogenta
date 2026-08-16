import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Task 1: `@cogenta/schema`'s queue-based scheduler
 * (`src/scheduling/publish.ts`) was written and tested from L1, but nothing
 * ever called `schedulePublication` and nothing ever drained the queue — the
 * admin showed "Scheduled" as a read-only badge. This proves the whole loop,
 * against a real server with a real (SQLite-backed) `database` queue driver:
 * an entry set to `scheduled` with a near-future `publishedAt` really
 * becomes `published`, once `runServe`'s own tick comes around.
 *
 * The tick interval is overridden to a few hundred milliseconds — see
 * `ServeOptions.scheduledPublishTickMs` — so this test does not wait a real
 * minute for the default cadence. The R1 promise it stands in for is
 * documented on that option and in `serve.ts`, not re-tested here.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    versioning: { drafts: true, history: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      publishedAt: { kind: 'datetime', options: {} },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['editor'],
      publish: ['editor'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-scheduling-'))
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

async function editorToken(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

describe('cogenta serve — scheduled publication', () => {
  it('publishes an entry on its own once the scheduled date comes due', async () => {
    const root = await project()
    // A fast tick, so the test does not wait the real 60s default.
    const server = await startServer(root, { registry: activeServers, scheduledPublishTickMs: 200 })
    try {
      const token = await editorToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ values: { title: 'Coming soon' } }),
      })
      expect(created.status).toBe(201)
      const entry = (await created.json()) as { data: { id: string } }

      const publishAt = new Date(Date.now() + 700).toISOString()
      const scheduled = await fetch(
        `${server.base}/api/content/article/${entry.data.id}/unpublish`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ status: 'scheduled', publishedAt: publishAt }),
        },
      )
      expect(scheduled.status).toBe(200)
      const scheduledBody = (await scheduled.json()) as { data: { status: string } }
      expect(scheduledBody.data.status).toBe('scheduled')

      // Not public yet — the whole point of "scheduled".
      const tooEarly = await fetch(`${server.base}/api/content/article/${entry.data.id}`)
      expect(tooEarly.status).toBe(404)
      await tooEarly.arrayBuffer()

      // Past `publishAt`, and past at least a couple of ticks.
      await sleep(1500)

      const published = await fetch(`${server.base}/api/content/article/${entry.data.id}`)
      expect(published.status).toBe(200)
      const publishedBody = (await published.json()) as { data: { status: string } }
      expect(publishedBody.data.status).toBe('published')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('leaves a schedule alone until its hour comes, however many ticks pass first', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, scheduledPublishTickMs: 150 })
    try {
      const token = await editorToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ values: { title: 'Not yet' } }),
      })
      const entry = (await created.json()) as { data: { id: string } }

      const publishAt = new Date(Date.now() + 60_000).toISOString()
      await fetch(`${server.base}/api/content/article/${entry.data.id}/unpublish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: 'scheduled', publishedAt: publishAt }),
      })

      // Several ticks pass; the entry's hour has not come.
      await sleep(600)

      const stillScheduled = await fetch(
        `${server.base}/api/content/article/${entry.data.id}?state=working`,
        { headers },
      )
      expect(stillScheduled.status).toBe(200)
      const body = (await stillScheduled.json()) as { data: { status: string } }
      expect(body.data.status).toBe('scheduled')
    } finally {
      await server.stop()
    }
  }, 60_000)
})
