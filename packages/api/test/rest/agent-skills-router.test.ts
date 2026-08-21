import { describe, expect, it } from 'vitest'
import {
  type AgentSkillRegistryLike,
  type AgentSkillSummary,
  createAgentSkillsRouter,
} from '../../src/rest/agent-skills-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }

function fakeRegistry(): AgentSkillRegistryLike {
  const records = new Map<string, AgentSkillSummary>()
  let counter = 0
  return {
    async list() {
      return [...records.values()]
    },
    async get(id) {
      return records.get(id)
    },
    async create(input) {
      counter += 1
      const skill: AgentSkillSummary = {
        id: `skill-${counter}`,
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        enabledByDefault: input.enabledByDefault ?? true,
        builtin: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }
      records.set(skill.id, skill)
      return skill
    },
    async update(id, patch) {
      const existing = records.get(id)
      if (existing === undefined) throw new Error('not found')
      const updated = { ...existing, ...patch }
      records.set(id, updated)
      return updated
    },
    async remove(id) {
      records.delete(id)
    },
  }
}

describe('/api/agent-skills', () => {
  it('refuses anyone below admin', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const response = await router.handle(
      { method: 'GET', path: '/api/agent-skills', query: {} },
      EDITOR,
    )
    expect(response.status).toBe(403)
  })

  it('refuses an anonymous caller', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const response = await router.handle(
      { method: 'GET', path: '/api/agent-skills', query: {} },
      ANONYMOUS,
    )
    expect(response.status).toBe(403)
  })

  it('creates, lists, updates and removes a skill', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })

    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/agent-skills',
        query: {},
        body: { name: 'Style', description: 'd', instructions: 'i' },
      },
      ADMIN,
    )
    expect(created.status).toBe(201)
    const id = (created.body as { data: AgentSkillSummary }).data.id

    const listed = await router.handle(
      { method: 'GET', path: '/api/agent-skills', query: {} },
      ADMIN,
    )
    expect((listed.body as { data: readonly AgentSkillSummary[] }).data).toHaveLength(1)

    const updated = await router.handle(
      {
        method: 'PATCH',
        path: `/api/agent-skills/${id}`,
        query: {},
        body: { instructions: 'new instructions' },
      },
      ADMIN,
    )
    expect((updated.body as { data: AgentSkillSummary }).data.instructions).toBe('new instructions')

    const removed = await router.handle(
      { method: 'DELETE', path: `/api/agent-skills/${id}`, query: {} },
      ADMIN,
    )
    expect(removed.status).toBe(200)
    const afterRemoval = await router.handle(
      { method: 'GET', path: '/api/agent-skills', query: {} },
      ADMIN,
    )
    expect((afterRemoval.body as { data: readonly AgentSkillSummary[] }).data).toHaveLength(0)
  })

  it('404s a GET for an unknown skill id', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const response = await router.handle(
      { method: 'GET', path: '/api/agent-skills/ghost', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })
})
