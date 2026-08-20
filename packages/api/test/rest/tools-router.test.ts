import { describe, expect, it } from 'vitest'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import {
  createToolsRouter,
  type ToolRunLike,
  type ToolsRouter,
} from '../../src/rest/tools-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `GET /api/tools`, `POST /api/tools/{id}/run`, `GET /api/tools/runs` and
 * `GET /api/tools/runs/{id}` — the "Outils" screen (fiche 24 task 3).
 *
 * The actual tool bodies and the queue live in `@cogenta/cli`; this suite
 * proves the HTTP shape, the admin-only gate, and that an unknown tool or
 * run id is a 404 rather than something the caller has to guess at.
 */

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const asAdmin: AccessContext = { actor: ADMIN }
const asEditor: AccessContext = { actor: EDITOR }
const asPublic: AccessContext = { actor: ANONYMOUS }

function request(method: string, path: string, body?: unknown): RestRequest {
  return { method, path, query: {}, body }
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

function errorOf(response: RestResponse): { readonly code: string } {
  return (response.body as { error: { code: string } }).error
}

const TOOLS = [
  {
    id: 'purge-cache',
    labelKey: 'tools.purgeCache',
    reversible: true,
    estimatedDurationKey: 'tools.durationSeconds',
  },
]

function routerWith(): {
  readonly router: ToolsRouter
  readonly started: { id: string; options: { external?: boolean; email?: string } }[]
  readonly runs: Map<string, ToolRunLike>
} {
  const started: { id: string; options: { external?: boolean; email?: string } }[] = []
  const runs = new Map<string, ToolRunLike>()
  const router = createToolsRouter({
    tools: TOOLS,
    run: async (id, options) => {
      started.push({ id, options })
      const runId = `run-${started.length}`
      runs.set(runId, {
        id: runId,
        tool: id,
        status: 'queued',
        startedAt: '2026-08-19T00:00:00.000Z',
        finishedAt: undefined,
        log: [],
        error: undefined,
      })
      return runId
    },
    getRun: (id) => runs.get(id) ?? null,
    listRuns: () => [...runs.values()],
  })
  return { router, started, runs }
}

describe('the tools transport', () => {
  describe('permissions', () => {
    it('refuses an anonymous listing of the tools', async () => {
      const { router } = routerWith()
      const response = await router.handle(request('GET', '/api/tools'), asPublic)
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses an editor from running a tool', async () => {
      const { router } = routerWith()
      const response = await router.handle(request('POST', '/api/tools/purge-cache/run'), asEditor)
      expect(response.status).toBe(403)
    })
  })

  it('lists the tool definitions', async () => {
    const { router } = routerWith()
    const response = await router.handle(request('GET', '/api/tools'), asAdmin)
    expect(response.status).toBe(200)
    expect(dataOf<{ tools: readonly unknown[] }>(response).tools).toEqual(TOOLS)
  })

  it('refuses to run an unknown tool', async () => {
    const { router } = routerWith()
    const response = await router.handle(request('POST', '/api/tools/not-a-tool/run'), asAdmin)
    expect(response.status).toBe(404)
    expect(errorOf(response).code).toBe('MAINT_TOOL_UNKNOWN')
  })

  it('starts a run and returns its id, without running it inline', async () => {
    const { router, started } = routerWith()
    const response = await router.handle(request('POST', '/api/tools/purge-cache/run'), asAdmin)
    expect(response.status).toBe(202)
    expect(dataOf<{ id: string }>(response).id).toBe('run-1')
    expect(started).toEqual([{ id: 'purge-cache', options: { external: false } }])
  })

  it('passes external and email through to run()', async () => {
    const { router, started } = routerWith()
    await router.handle(
      request('POST', '/api/tools/purge-cache/run', { external: true, email: 'ops@example.com' }),
      asAdmin,
    )
    expect(started).toEqual([
      { id: 'purge-cache', options: { external: true, email: 'ops@example.com' } },
    ])
  })

  it('reads back a run by id', async () => {
    const { router } = routerWith()
    const started = await router.handle(request('POST', '/api/tools/purge-cache/run'), asAdmin)
    const runId = dataOf<{ id: string }>(started).id
    const response = await router.handle(request('GET', `/api/tools/runs/${runId}`), asAdmin)
    expect(response.status).toBe(200)
    expect(dataOf<ToolRunLike>(response).tool).toBe('purge-cache')
  })

  it('answers 404 for an unknown run id', async () => {
    const { router } = routerWith()
    const response = await router.handle(request('GET', '/api/tools/runs/nope'), asAdmin)
    expect(response.status).toBe(404)
    expect(errorOf(response).code).toBe('MAINT_TOOL_RUN_NOT_FOUND')
  })

  it('lists recent runs', async () => {
    const { router } = routerWith()
    await router.handle(request('POST', '/api/tools/purge-cache/run'), asAdmin)
    await router.handle(request('POST', '/api/tools/purge-cache/run'), asAdmin)
    const response = await router.handle(request('GET', '/api/tools/runs'), asAdmin)
    expect(dataOf<{ runs: readonly unknown[] }>(response).runs).toHaveLength(2)
  })
})
