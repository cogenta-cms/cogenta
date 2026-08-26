import { describe, expect, it } from 'vitest'
import {
  createPromptTemplatesRouter,
  type PromptTemplateRegistryLike,
  type PromptTemplateSummary,
} from '../../src/rest/prompt-templates-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }

function fakeRegistry(): PromptTemplateRegistryLike {
  const records = new Map<string, PromptTemplateSummary>()
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
      const template: PromptTemplateSummary = {
        id: `template-${counter}`,
        name: input.name,
        description: input.description,
        category: input.category,
        template: input.template,
        builtin: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }
      records.set(template.id, template)
      return template
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

describe('/api/prompt-templates', () => {
  it('allows a signed-in non-admin actor to read the list', async () => {
    const router = createPromptTemplatesRouter({ templates: fakeRegistry() })
    const response = await router.handle(
      { method: 'GET', path: '/api/prompt-templates', query: {} },
      EDITOR,
    )
    expect(response.status).toBe(200)
  })

  it('refuses an anonymous caller, even for a read', async () => {
    const router = createPromptTemplatesRouter({ templates: fakeRegistry() })
    const response = await router.handle(
      { method: 'GET', path: '/api/prompt-templates', query: {} },
      ANONYMOUS,
    )
    expect(response.status).toBe(403)
  })

  it('refuses a non-admin actor writing', async () => {
    const router = createPromptTemplatesRouter({ templates: fakeRegistry() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/prompt-templates',
        query: {},
        body: { name: 'x', description: 'x', category: 'text', template: 'x' },
      },
      EDITOR,
    )
    expect(response.status).toBe(403)
  })

  it('creates, lists, updates and removes a template as admin', async () => {
    const router = createPromptTemplatesRouter({ templates: fakeRegistry() })

    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/prompt-templates',
        query: {},
        body: {
          name: 'Rewrite',
          description: 'Rewrite a passage.',
          category: 'text',
          template: 'Rewrite the passage. {{localeLine}}',
        },
      },
      ADMIN,
    )
    expect(created.status).toBe(201)
    const createdTemplate = (created.body as { data: PromptTemplateSummary }).data
    const id = createdTemplate.id
    expect(createdTemplate.template).toBe('Rewrite the passage. {{localeLine}}')

    const listed = await router.handle(
      { method: 'GET', path: '/api/prompt-templates', query: {} },
      ADMIN,
    )
    expect((listed.body as { data: readonly PromptTemplateSummary[] }).data).toHaveLength(1)

    const updated = await router.handle(
      {
        method: 'PATCH',
        path: `/api/prompt-templates/${id}`,
        query: {},
        body: { template: 'Rewrite it. {{localeLine}}' },
      },
      ADMIN,
    )
    expect((updated.body as { data: PromptTemplateSummary }).data.template).toBe(
      'Rewrite it. {{localeLine}}',
    )

    const removed = await router.handle(
      { method: 'DELETE', path: `/api/prompt-templates/${id}`, query: {} },
      ADMIN,
    )
    expect(removed.status).toBe(200)
    const afterRemoval = await router.handle(
      { method: 'GET', path: '/api/prompt-templates', query: {} },
      ADMIN,
    )
    expect((afterRemoval.body as { data: readonly PromptTemplateSummary[] }).data).toHaveLength(0)
  })

  it('404s a GET for an unknown template id', async () => {
    const router = createPromptTemplatesRouter({ templates: fakeRegistry() })
    const response = await router.handle(
      { method: 'GET', path: '/api/prompt-templates/ghost', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })

  it('rejects a create missing a required field', async () => {
    const router = createPromptTemplatesRouter({ templates: fakeRegistry() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/prompt-templates',
        query: {},
        body: { name: 'x' },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })
})
