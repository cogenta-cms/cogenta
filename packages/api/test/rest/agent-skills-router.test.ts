import { describe, expect, it } from 'vitest'
import {
  type AgentSkillRegistryLike,
  type AgentSkillResourceSummary,
  type AgentSkillSummary,
  createAgentSkillsRouter,
} from '../../src/rest/agent-skills-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }

function contentOf(name: string, description: string, instructions: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${instructions}\n`
}

function fakeRegistry(): AgentSkillRegistryLike {
  const records = new Map<string, AgentSkillSummary>()
  const resources = new Map<string, Map<string, AgentSkillResourceSummary>>()
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
        content: contentOf(input.name, input.description, input.instructions),
        enabledByDefault: input.enabledByDefault ?? true,
        builtin: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }
      records.set(skill.id, skill)
      resources.set(skill.id, new Map())
      return skill
    },
    async update(id, patch) {
      const existing = records.get(id)
      if (existing === undefined) throw new Error('not found')
      const updated = {
        ...existing,
        ...patch,
        content: contentOf(
          patch.name ?? existing.name,
          patch.description ?? existing.description,
          patch.instructions ?? existing.instructions,
        ),
      }
      records.set(id, updated)
      return updated
    },
    async remove(id) {
      records.delete(id)
      resources.delete(id)
    },
    async listResources(id) {
      return [...(resources.get(id) ?? new Map()).values()]
    },
    async addResource(id, relativePath, content) {
      const bucket = resources.get(id)
      if (bucket === undefined) throw new Error('not found')
      const size = typeof content === 'string' ? Buffer.byteLength(content) : content.byteLength
      const resource: AgentSkillResourceSummary = {
        path: relativePath,
        size,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }
      bucket.set(relativePath, resource)
      return resource
    },
    async removeResource(id, relativePath) {
      const bucket = resources.get(id)
      bucket?.delete(relativePath)
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
        body: { content: contentOf('Style', 'd', 'i') },
      },
      ADMIN,
    )
    expect(created.status).toBe(201)
    const createdSkill = (created.body as { data: AgentSkillSummary }).data
    const id = createdSkill.id
    expect(createdSkill.content).toBe(contentOf('Style', 'd', 'i'))

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
        body: { content: contentOf('Style', 'd', 'new instructions') },
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

  it('rejects content with no frontmatter block', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/agent-skills',
        query: {},
        body: { content: 'not a skill file' },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'SKILL_DEFINITION_INVALID',
    )
  })

  // L24 task 4's acceptance criterion: a SKILL.md with no `version` field —
  // exactly what a real Claude Code/Codex skill looks like, and what
  // `.claude/skills/*/SKILL.md` in this very repo carries — imports without
  // error, name/description/instructions taken straight from it.
  it('imports a real Claude Code style SKILL.md (name + description only, no version)', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const realSkillMd = [
      '---',
      'name: new-package',
      'description: Use when creating a new @cogenta/* package in the monorepo — produces the exact skeleton (package.json, tsconfig, exports, test layout, changeset) that matches the project’s ESM-strict, publishable-package conventions.',
      '---',
      '',
      '# Créer un paquet `@cogenta/*`',
      '',
      'Vérifie que le paquet est bien prévu par la spec du lot en cours.',
      '',
    ].join('\n')

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/agent-skills',
        query: {},
        body: { content: realSkillMd },
      },
      ADMIN,
    )
    expect(response.status).toBe(201)
    const created = (response.body as { data: AgentSkillSummary }).data
    expect(created.name).toBe('new-package')
    expect(created.description).toContain('Use when creating a new @cogenta/* package')
    expect(created.instructions).toContain('Créer un paquet')
  })
})

describe('/api/agent-skills/:id/resources (fiche 57)', () => {
  async function createSkill(router: ReturnType<typeof createAgentSkillsRouter>): Promise<string> {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/agent-skills',
        query: {},
        body: { content: contentOf('R', 'd', 'i') },
      },
      ADMIN,
    )
    return (created.body as { data: AgentSkillSummary }).data.id
  }

  it('refuses anyone below admin on every resource route', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const id = await createSkill(router)

    const list = await router.handle(
      { method: 'GET', path: `/api/agent-skills/${id}/resources`, query: {} },
      EDITOR,
    )
    expect(list.status).toBe(403)

    const upload = await router.handle(
      {
        method: 'POST',
        path: `/api/agent-skills/${id}/resources`,
        query: {},
        body: { path: 'references/x.md', content: 'x' },
      },
      EDITOR,
    )
    expect(upload.status).toBe(403)

    const remove = await router.handle(
      { method: 'DELETE', path: `/api/agent-skills/${id}/resources/references/x.md`, query: {} },
      EDITOR,
    )
    expect(remove.status).toBe(403)
  })

  it('uploads, lists and removes a resource via a JSON body', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const id = await createSkill(router)

    const uploaded = await router.handle(
      {
        method: 'POST',
        path: `/api/agent-skills/${id}/resources`,
        query: {},
        body: { path: 'references/style-guide.md', content: '# Style' },
      },
      ADMIN,
    )
    expect(uploaded.status).toBe(201)
    expect((uploaded.body as { data: AgentSkillResourceSummary }).data.path).toBe(
      'references/style-guide.md',
    )

    const listed = await router.handle(
      { method: 'GET', path: `/api/agent-skills/${id}/resources`, query: {} },
      ADMIN,
    )
    expect((listed.body as { data: readonly AgentSkillResourceSummary[] }).data).toHaveLength(1)

    const removed = await router.handle(
      {
        method: 'DELETE',
        path: `/api/agent-skills/${id}/resources/references/style-guide.md`,
        query: {},
      },
      ADMIN,
    )
    expect(removed.status).toBe(200)

    const afterRemoval = await router.handle(
      { method: 'GET', path: `/api/agent-skills/${id}/resources`, query: {} },
      ADMIN,
    )
    expect((afterRemoval.body as { data: readonly AgentSkillResourceSummary[] }).data).toHaveLength(
      0,
    )
  })

  it('uploads via a real multipart/form-data body', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const id = await createSkill(router)

    const uploaded = await router.handle(
      {
        method: 'POST',
        path: `/api/agent-skills/${id}/resources`,
        query: {},
        body: {
          fields: { path: 'assets/logo.svg' },
          files: [
            {
              fieldName: 'file',
              filename: 'logo.svg',
              mimeType: 'image/svg+xml',
              data: new Uint8Array([1, 2, 3]),
            },
          ],
        },
      },
      ADMIN,
    )
    expect(uploaded.status).toBe(201)
    const data = (uploaded.body as { data: AgentSkillResourceSummary }).data
    expect(data.path).toBe('assets/logo.svg')
    expect(data.size).toBe(3)
  })

  it('rejects an upload with no "path" field', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const id = await createSkill(router)
    const response = await router.handle(
      {
        method: 'POST',
        path: `/api/agent-skills/${id}/resources`,
        query: {},
        body: { content: 'x' },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'AGENT_SKILL_RESOURCE_INVALID',
    )
  })

  it('404s a plain GET on an unknown route segment', async () => {
    const router = createAgentSkillsRouter({ skills: fakeRegistry() })
    const id = await createSkill(router)
    const response = await router.handle(
      { method: 'GET', path: `/api/agent-skills/${id}/other`, query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })
})
