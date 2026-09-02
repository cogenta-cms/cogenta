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

/** Same as `project()`, with `security.audit.retainDays` configured (T09-01). */
async function projectWithAuditRetention(retainDays: number): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-scheduled-audit-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  security: { audit: { retainDays: ${retainDays} } },
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
  // T09-01 — always registered, same as `audit-integrity` right above:
  // whether it actually purges anything depends entirely on
  // `security.audit.retainDays` being configured.
  'audit-prune',
  'trash-purge',
  'forms-purge',
  'channel-notifications',
  'analytics-purge',
  'updates-auto-check',
  // Fiche 52 task 2 — always registered: `runServe` always builds a real
  // (degraded) `FileEmailTransport`, so the commerce order-email retry
  // queue always exists, whether or not the site sells anything yet.
  'commerce-order-emails',
  // Fiche 53 tasks 3/5, audit T-COM-01 — always registered: `commerce`
  // tables and stores exist unconditionally (contract E, ADR-0024), so
  // subscription billing/dunning/renewal notices need no email transport
  // to be scheduled, only `sendRenewalNotices` itself degrades to a safe
  // no-op (R2) without one.
  'commerce-subscriptions',
  // Audit A1-commerce P2 — always registered, same reasoning as
  // `commerce-subscriptions`: no email transport needed, only this site's
  // own unconditionally-created commerce tables.
  'commerce-carts',
].sort()

describe('cogenta serve — /api/scheduled-tasks', () => {
  it('lists the eleven registered recurring jobs, not a 404', async () => {
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

/**
 * `audit-prune` (T09-01) — `AuditLog.prune()` (`@cogenta/auth`) existed
 * since fiche 21 task 5 with no scheduled caller anywhere in the codebase.
 * The actual deletion/hash-chain mechanics are already proven, entry by
 * entry, in `packages/auth/test/audit.test.ts`'s own
 * `describe('AuditLog.prune (fiche 21 task 5)')`; this suite proves the
 * wiring: the task is registered (`TASK_NAMES` above), a site with no
 * `retainDays` never purges, and one with `retainDays` configured accepts
 * it without corrupting the still-fresh log a real run against this suite's
 * own just-created entries produces.
 */
describe('audit-prune (T09-01)', () => {
  it('purges nothing on a site that never configured retainDays (R1 default)', async () => {
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
      const before = await fetch(`${server.base}/api/audit`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const beforeCount = ((await before.json()) as { data: readonly unknown[] }).data.length

      const run = await fetch(`${server.base}/api/scheduled-tasks/audit-prune/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(run.status).toBe(200)
      const runBody = (await run.json()) as { data: { outcome: string; summary: string | null } }
      expect(runBody.data.outcome).toBe('success')
      expect(runBody.data.summary).toBe('0 purged')

      const after = await fetch(`${server.base}/api/audit`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const afterCount = ((await after.json()) as { data: readonly unknown[] }).data.length
      // The run itself did not add a prune entry (it pruned nothing), and
      // nothing that was there before is gone.
      expect(afterCount).toBeGreaterThanOrEqual(beforeCount)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('accepts a configured retention window and leaves this run’s own fresh entries intact', async () => {
    const root = await projectWithAuditRetention(30)
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
      const before = await fetch(`${server.base}/api/audit`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const beforeEntries = ((await before.json()) as { data: readonly { id: string }[] }).data

      const run = await fetch(`${server.base}/api/scheduled-tasks/audit-prune/run`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(run.status).toBe(200)
      const runBody = (await run.json()) as { data: { outcome: string } }
      expect(runBody.data.outcome).toBe('success')

      const after = await fetch(`${server.base}/api/audit`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const afterEntries = ((await after.json()) as { data: readonly { id: string }[] }).data
      // Nothing recorded moments ago by this very test is older than 30
      // days — a configured window must not touch what is still fresh.
      const afterIds = new Set(afterEntries.map((entry) => entry.id))
      expect(beforeEntries.every((entry) => afterIds.has(entry.id))).toBe(true)

      // The chain still verifies — a real run against a real (if empty)
      // prune did not corrupt anything.
      const verify = await fetch(`${server.base}/api/audit/verify`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(verify.status).toBe(200)
    } finally {
      await server.stop()
    }
  }, 60_000)
})
