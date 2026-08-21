import {
  createAgentRegistry,
  createMemoryTraceStore,
  defineAgent,
  type TraceStore,
} from '@cogenta/agents'
import { createAuditLog, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AgentsRouter, createAgentsRouter } from '../../src/rest/agents-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }

function securityAgent() {
  return defineAgent({
    name: 'security',
    identity: './identity.md',
    model: { preferred: 'claude-sonnet', fallback: 'local' },
    tools: ['deps.scan'],
    skills: ['cve-triage'],
    autonomy: { default: 'propose', overrides: { 'deps.scan': 'autonomous' } },
    budget: { tokensPerDay: 200_000 },
    memory: { episodic: true, scope: 'site' },
    triggers: [{ on: 'schedule', cron: '0 6 * * *' }],
  })
}

let db: DatabaseHandle
let traces: TraceStore
let router: AgentsRouter

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  await ensureAuthTables(db)
  const audit = createAuditLog(db)
  await audit.record({
    actorId: 'agent:security',
    actorRoles: ['agent'],
    action: 'deps.scan',
  })
  await audit.record({ actorId: 'user-editor', actorRoles: ['editor'], action: 'content.publish' })

  traces = createMemoryTraceStore()
  await traces.save({
    id: 'trace-1',
    agentName: 'security',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 5 },
    steps: [],
    messages: [],
  })

  const registry = createAgentRegistry([securityAgent()])
  router = createAgentsRouter({ agents: registry, traces, audit })
})

afterEach(async () => {
  await db.close()
})

describe('GET /api/agents', () => {
  it('refuses anyone below admin', async () => {
    const response = await router.handle({ method: 'GET', path: '/api/agents', query: {} }, EDITOR)
    expect(response.status).toBe(403)
  })

  it('refuses an anonymous caller', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/agents', query: {} },
      ANONYMOUS,
    )
    expect(response.status).toBe(403)
  })

  it('lists every registered agent, with its enabled state, autonomy and budget', async () => {
    const response = await router.handle({ method: 'GET', path: '/api/agents', query: {} }, ADMIN)
    expect(response.status).toBe(200)
    const body = response.body as { data: readonly Record<string, unknown>[] }
    expect(body.data).toEqual([
      expect.objectContaining({
        name: 'security',
        enabled: true,
        tools: ['deps.scan'],
        autonomy: { default: 'propose', overrides: { 'deps.scan': 'autonomous' } },
        budget: { tokensPerDay: 200_000 },
      }),
    ])
  })

  it('passes through skills, subagents, model, memory and triggers unchanged (fiche 4)', async () => {
    const response = await router.handle({ method: 'GET', path: '/api/agents', query: {} }, ADMIN)
    const body = response.body as { data: readonly Record<string, unknown>[] }
    expect(body.data).toEqual([
      expect.objectContaining({
        skills: ['cve-triage'],
        subagents: undefined,
        model: { preferred: 'claude-sonnet', fallback: 'local' },
        memory: { episodic: true, scope: 'site' },
        triggers: [{ on: 'schedule', cron: '0 6 * * *' }],
      }),
    ])
  })
})

describe('GET /api/agents/:name', () => {
  it('answers 404 for an unregistered agent', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/agents/ghost', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })

  it('answers the one agent’s detail', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/agents/security', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { name: string } }).data.name).toBe('security')
  })
})

describe('POST /api/agents/:name/enable and /disable', () => {
  it('disables then re-enables an agent, reflected in isEnabled', async () => {
    const disable = await router.handle(
      { method: 'POST', path: '/api/agents/security/disable', query: {} },
      ADMIN,
    )
    expect(disable.status).toBe(200)
    expect((disable.body as { data: { enabled: boolean } }).data.enabled).toBe(false)

    const detail = await router.handle(
      { method: 'GET', path: '/api/agents/security', query: {} },
      ADMIN,
    )
    expect((detail.body as { data: { enabled: boolean } }).data.enabled).toBe(false)

    const enable = await router.handle(
      { method: 'POST', path: '/api/agents/security/enable', query: {} },
      ADMIN,
    )
    expect((enable.body as { data: { enabled: boolean } }).data.enabled).toBe(true)
  })

  it('answers 404 for an unregistered agent', async () => {
    const response = await router.handle(
      { method: 'POST', path: '/api/agents/ghost/disable', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })
})

describe('GET /api/agents/:name/traces', () => {
  it('lists traces filtered to that agent', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/agents/security/traces', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: readonly { id: string }[] }
    expect(body.data.map((t) => t.id)).toEqual(['trace-1'])
  })

  it('returns an empty list when no trace store was wired in', async () => {
    const registry = createAgentRegistry([securityAgent()])
    const withoutTraces = createAgentsRouter({ agents: registry })

    const response = await withoutTraces.handle(
      { method: 'GET', path: '/api/agents/security/traces', query: {} },
      ADMIN,
    )
    expect(response.body).toEqual({ data: [] })
  })
})

describe('GET /api/agents/:name/history', () => {
  it('lists audit entries scoped to that agent’s actor id', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/agents/security/history', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: readonly { actorId: string | null }[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.actorId).toBe('agent:security')
  })

  it('returns an empty list when no audit log was wired in', async () => {
    const registry = createAgentRegistry([securityAgent()])
    const withoutAudit = createAgentsRouter({ agents: registry })

    const response = await withoutAudit.handle(
      { method: 'GET', path: '/api/agents/security/history', query: {} },
      ADMIN,
    )
    expect(response.body).toEqual({ data: [] })
  })
})

/** A minimal in-memory `AgentRegistryLike` that actually implements the L22 task 1 CRUD capabilities — `createAgentRegistry` (above) deliberately does not, since it wraps a fixed declaration array. */
function crudCapableRegistry() {
  const byName = new Map<string, Record<string, unknown>>()
  const enabled = new Set<string>()
  byName.set('security', { name: 'security', tools: ['deps.scan'], builtin: true })
  enabled.add('security')

  return {
    list: () => [...byName.values()] as never,
    get: (name: string) => byName.get(name) as never,
    enable: (name: string) => {
      enabled.add(name)
    },
    disable: (name: string) => {
      enabled.delete(name)
    },
    isEnabled: (name: string) => enabled.has(name),
    create: async (input: Record<string, unknown>) => {
      const name = String(input['name'])
      byName.set(name, { ...input, builtin: false })
      enabled.add(name)
    },
    update: async (name: string, patch: Record<string, unknown>) => {
      const existing = byName.get(name)
      if (existing === undefined) throw new Error('unknown')
      byName.set(name, { ...existing, ...patch })
    },
    remove: async (name: string) => {
      byName.delete(name)
      enabled.delete(name)
    },
    readIdentity: async () => ({ role: 'r', objectives: [] as readonly string[] }),
  }
}

describe('POST /api/agents (create)', () => {
  it('creates a new agent when the registry supports it', async () => {
    const crud = createAgentsRouter({ agents: crudCapableRegistry() })
    const response = await crud.handle(
      {
        method: 'POST',
        path: '/api/agents',
        query: {},
        body: {
          name: 'Helper',
          identity: { role: 'r', objectives: [] },
          model: { preferred: 'anthropic' },
          tools: ['content.read'],
        },
      },
      ADMIN,
    )
    expect(response.status).toBe(201)
    expect((response.body as { data: { name: string } }).data.name).toBe('Helper')
  })

  it('answers AGENT_REGISTRY_READ_ONLY when the registry has no create()', async () => {
    const registry = createAgentRegistry([securityAgent()])
    const readOnly = createAgentsRouter({ agents: registry })
    const response = await readOnly.handle(
      { method: 'POST', path: '/api/agents', query: {}, body: { name: 'x' } },
      ADMIN,
    )
    // 501, matching `SITE_PLAN_NO_PROVIDER`: nothing is broken, this
    // instance's registry simply does not offer the capability.
    expect(response.status).toBe(501)
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'AGENT_REGISTRY_READ_ONLY',
    )
  })
})

describe('PATCH /api/agents/:name (update)', () => {
  it('updates an existing agent', async () => {
    const crud = createAgentsRouter({ agents: crudCapableRegistry() })
    const response = await crud.handle(
      {
        method: 'PATCH',
        path: '/api/agents/security',
        query: {},
        body: { tools: ['deps.scan', 'content.read'] },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { tools: string[] } }).data.tools).toEqual([
      'deps.scan',
      'content.read',
    ])
  })
})

describe('DELETE /api/agents/:name (remove)', () => {
  it('removes a non-builtin agent', async () => {
    const crud = crudCapableRegistry()
    const router2 = createAgentsRouter({ agents: crud })
    await router2.handle(
      {
        method: 'POST',
        path: '/api/agents',
        query: {},
        body: {
          name: 'Removable',
          identity: { role: 'r', objectives: [] },
          model: { preferred: 'anthropic' },
          tools: [],
        },
      },
      ADMIN,
    )
    const response = await router2.handle(
      { method: 'DELETE', path: '/api/agents/Removable', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(crud.get('Removable')).toBeUndefined()
  })
})

describe('POST /api/agents/:name/run', () => {
  it('answers AGENT_RUNTIME_UNAVAILABLE when no runner is wired', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/agents/security/run',
        query: {},
        body: { instruction: 'go' },
      },
      ADMIN,
    )
    // 503, matching `ASSIST_UNAVAILABLE`: the route exists, this site
    // simply has no live agent runner wired in.
    expect(response.status).toBe(503)
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'AGENT_RUNTIME_UNAVAILABLE',
    )
  })

  it('invokes the wired runner and returns its summary', async () => {
    const runner = {
      run: async (name: string, instruction: string) => ({
        agent: name,
        stopReason: 'end_turn',
        finalText: `did: ${instruction}`,
        steps: 1,
      }),
    }
    const withRunner = createAgentsRouter({
      agents: createAgentRegistry([securityAgent()]),
      runner,
    })
    const response = await withRunner.handle(
      {
        method: 'POST',
        path: '/api/agents/security/run',
        query: {},
        body: { instruction: 'scan now' },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { finalText: string } }).data.finalText).toBe('did: scan now')
  })

  it('refuses an empty instruction', async () => {
    const runner = {
      run: async () => ({ agent: 'x', stopReason: 'end_turn', finalText: null, steps: 0 }),
    }
    const withRunner = createAgentsRouter({
      agents: createAgentRegistry([securityAgent()]),
      runner,
    })
    const response = await withRunner.handle(
      { method: 'POST', path: '/api/agents/security/run', query: {}, body: { instruction: '' } },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })
})
