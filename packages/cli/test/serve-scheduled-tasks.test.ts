import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `GET /api/scheduled-tasks`, `GET /api/scheduled-tasks/queue` and `POST
 * /api/scheduled-tasks/{name}/run` (fiche 28 task 2) against a real server.
 *
 * L20 audit §1 point 6: the admin's "Tâches planifiées" screen had real,
 * tested client and server code (`@cogenta/schema`'s `ScheduledTaskRegistry`,
 * `@cogenta/api`'s `createScheduledTasksRouter`) on both ends, but `cogenta
 * serve` never actually constructed either — the seven recurring jobs kept
 * running on their own bare `setInterval`s, invisible to the registry, so
 * every request this screen made 404'd through the generic "no route
 * matches this path" content-router fallback. This suite is the first thing
 * that ever calls these routes end to end.
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
  const root = await mkdtemp(join(tmpdir(), 'cogenta-scheduled-'))
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

const TASK_NAMES = [
  'scheduled-publish',
  'not-found-purge',
  'audit-integrity',
  'trash-purge',
  'forms-purge',
  'channel-notifications',
  'analytics-purge',
  'updates-auto-check',
].sort()

describe('cogenta serve — /api/scheduled-tasks', () => {
  it('lists the eight registered recurring jobs, not a 404', async () => {
    const root = await project()
    // Slow every tick way down: this test only cares that the route exists
    // and answers with real registrations, not that a sweep actually fires
    // within the test's lifetime.
    const server = await startServer(root, {
      registry: activeServers,
      scheduledPublishTickMs: 3_600_000,
      notFoundPurgeTickMs: 3_600_000,
      auditIntegrityTickMs: 3_600_000,
      trashPurgeTickMs: 3_600_000,
      formsPurgeTickMs: 3_600_000,
    })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/scheduled-tasks`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: { mode: string; tasks: readonly { name: string; destructive: boolean }[] }
      }
      expect(body.data.mode).toBe('internal')
      expect(body.data.tasks.map((task) => task.name).sort()).toEqual(TASK_NAMES)
      // Fiche 28's own named pitfall: a manual run of the trash sweep must
      // ask for confirmation first — the admin screen reads this flag to
      // decide that.
      expect(body.data.tasks.find((task) => task.name === 'trash-purge')?.destructive).toBe(true)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('answers the queue route with a real (empty) job list, not a 404', async () => {
    const root = await project()
    const server = await startServer(root, {
      registry: activeServers,
      scheduledPublishTickMs: 3_600_000,
      notFoundPurgeTickMs: 3_600_000,
      auditIntegrityTickMs: 3_600_000,
      trashPurgeTickMs: 3_600_000,
      formsPurgeTickMs: 3_600_000,
    })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/scheduled-tasks/queue`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: { jobs: readonly unknown[] } }
      expect(Array.isArray(body.data.jobs)).toBe(true)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('runs a task now, and the next listing shows it as its last run', async () => {
    const root = await project()
    const server = await startServer(root, {
      registry: activeServers,
      scheduledPublishTickMs: 3_600_000,
      notFoundPurgeTickMs: 3_600_000,
      auditIntegrityTickMs: 3_600_000,
      trashPurgeTickMs: 3_600_000,
      formsPurgeTickMs: 3_600_000,
    })
    try {
      const token = await adminToken(root, server.base)
      const run = await fetch(`${server.base}/api/scheduled-tasks/not-found-purge/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(run.status).toBe(200)
      const runBody = (await run.json()) as {
        data: { outcome: string; triggeredBy: string; actor: string | null }
      }
      expect(runBody.data.outcome).toBe('success')
      expect(runBody.data.triggeredBy).toBe('manual')

      const list = await fetch(`${server.base}/api/scheduled-tasks`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const listBody = (await list.json()) as {
        data: { tasks: readonly { name: string; lastRun: { outcome: string } | null }[] }
      }
      const task = listBody.data.tasks.find((entry) => entry.name === 'not-found-purge')
      expect(task?.lastRun?.outcome).toBe('success')
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses a non-admin with 403', async () => {
    const root = await project()
    const server = await startServer(root, {
      registry: activeServers,
      scheduledPublishTickMs: 3_600_000,
      notFoundPurgeTickMs: 3_600_000,
      auditIntegrityTickMs: 3_600_000,
      trashPurgeTickMs: 3_600_000,
      formsPurgeTickMs: 3_600_000,
    })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const response = await fetch(`${server.base}/api/scheduled-tasks`, {
        headers: { authorization: `Bearer ${editorToken}` },
      })
      expect(response.status).toBe(403)
      await response.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})
