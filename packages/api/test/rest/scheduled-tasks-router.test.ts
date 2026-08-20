import { createDatabaseQueue, createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { createScheduledTaskRegistry, type ScheduledTaskRegistry } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createScheduledTasksRouter,
  type ScheduledTasksRouter,
} from '../../src/rest/scheduled-tasks-router.js'
import { type AccessContext, ANONYMOUS as ANONYMOUS_ACTOR } from '../../src/types.js'

const ADMIN: AccessContext = { actor: { id: 'user-admin', roles: ['admin'] } }
const EDITOR: AccessContext = { actor: { id: 'user-editor', roles: ['editor'] } }
const ANONYMOUS: AccessContext = { actor: ANONYMOUS_ACTOR }

let db: DatabaseHandle
let registry: ScheduledTaskRegistry
let router: ScheduledTasksRouter
let manualRuns: { taskName: string; outcome: string; actorId: string | null }[]

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  registry = createScheduledTaskRegistry({ db })
  registry.register({
    name: 'publish',
    description: 'Scheduled publication',
    intervalMs: 60_000,
    run: async () => ({ summary: '2 published' }),
  })
  registry.register({
    name: 'trash-purge',
    description: 'Trash purge',
    intervalMs: 60_000,
    destructive: true,
    run: async () => ({ summary: '5 purged' }),
  })

  const queue = createDatabaseQueue({ db })
  queue.process('demo', async () => {
    throw new Error('nope')
  })
  await queue.enqueue({ name: 'demo', maxAttempts: 1 })
  await queue.tick()

  manualRuns = []
  router = createScheduledTasksRouter({
    registry,
    queue,
    mode: 'internal',
    onManualRun: (run) => manualRuns.push(run),
  })
})

afterEach(async () => {
  await db.close()
})

describe('GET /api/scheduled-tasks', () => {
  it('refuses anyone below admin', async () => {
    const asEditor = await router.handle(
      { method: 'GET', path: '/api/scheduled-tasks', query: {} },
      EDITOR,
    )
    expect(asEditor.status).toBe(403)

    const asAnonymous = await router.handle(
      { method: 'GET', path: '/api/scheduled-tasks', query: {} },
      ANONYMOUS,
    )
    expect(asAnonymous.status).toBe(403)
  })

  it('lists every registered task with the active clock mode', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/scheduled-tasks', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { mode: string; tasks: { name: string }[] } }
    expect(body.data.mode).toBe('internal')
    expect(body.data.tasks.map((task) => task.name).sort()).toEqual(['publish', 'trash-purge'])
  })
})

describe('GET /api/scheduled-tasks/{name}', () => {
  it('answers with 404 for an unregistered name', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/scheduled-tasks/no-such-task', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })

  it('answers with the task state, destructive flag included', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/scheduled-tasks/trash-purge', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { name: string; destructive: boolean } }
    expect(body.data.name).toBe('trash-purge')
    expect(body.data.destructive).toBe(true)
  })
})

describe('POST /api/scheduled-tasks/{name}/run', () => {
  it('refuses anyone below admin', async () => {
    const response = await router.handle(
      { method: 'POST', path: '/api/scheduled-tasks/publish/run', query: {}, body: {} },
      EDITOR,
    )
    expect(response.status).toBe(403)
  })

  it('runs the task now and journals who ran it', async () => {
    const response = await router.handle(
      { method: 'POST', path: '/api/scheduled-tasks/publish/run', query: {}, body: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { outcome: string; summary: string | null } }
    expect(body.data.outcome).toBe('success')
    expect(body.data.summary).toBe('2 published')

    expect(manualRuns).toEqual([{ taskName: 'publish', outcome: 'success', actorId: 'user-admin' }])
  })
})

describe('GET /api/scheduled-tasks/queue', () => {
  it('lists jobs from the maintenance queue', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/scheduled-tasks/queue', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: { jobs: { name: string; status: string }[] } }
    expect(body.data.jobs).toHaveLength(1)
    expect(body.data.jobs[0]?.name).toBe('demo')
    expect(body.data.jobs[0]?.status).toBe('failed')
  })

  it('narrows by status', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/scheduled-tasks/queue?status=completed', query: {} },
      ADMIN,
    )
    const body = response.body as { data: { jobs: unknown[] } }
    expect(body.data.jobs).toHaveLength(0)
  })

  it('answers an empty list when no queue was configured', async () => {
    const noQueueRouter = createScheduledTasksRouter({ registry, mode: 'internal' })
    const response = await noQueueRouter.handle(
      { method: 'GET', path: '/api/scheduled-tasks/queue', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { jobs: unknown[] } }).data.jobs).toEqual([])
  })
})

describe('POST /api/scheduled-tasks/queue/{id}/retry', () => {
  it('retries a failed job', async () => {
    const listed = await router.handle(
      { method: 'GET', path: '/api/scheduled-tasks/queue', query: {} },
      ADMIN,
    )
    const jobs = (listed.body as { data: { jobs: { id: string }[] } }).data.jobs
    const id = jobs[0]?.id as string

    const response = await router.handle(
      { method: 'POST', path: `/api/scheduled-tasks/queue/${id}/retry`, query: {}, body: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { retried: boolean } }).data.retried).toBe(true)
  })

  it('answers 404 for a job that cannot be retried', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/scheduled-tasks/queue/no-such-job/retry',
        query: {},
        body: {},
      },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })
})
