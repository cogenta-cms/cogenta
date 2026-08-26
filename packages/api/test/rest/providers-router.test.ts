import { describe, expect, it } from 'vitest'
import {
  createProvidersRouter,
  type ProviderRegistryLike,
  type ProviderSummary,
} from '../../src/rest/providers-router.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN = { id: 'user-admin', roles: ['admin'] }
const EDITOR = { id: 'user-editor', roles: ['editor'] }

function fakeRegistry(): ProviderRegistryLike & { records: Map<string, ProviderSummary> } {
  const records = new Map<string, ProviderSummary>()
  return {
    names: ['anthropic', 'openai', 'google', 'openrouter', 'deepseek', 'qwen', 'glm'],
    catalog: [
      {
        id: 'anthropic',
        label: 'Anthropic',
        wireFormat: 'anthropic',
        defaultBaseUrl: 'https://api.anthropic.com/v1/messages',
        knownModels: ['claude-sonnet-5'],
      },
      {
        id: 'openrouter',
        label: 'OpenRouter',
        wireFormat: 'openai-compatible',
        defaultBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        knownModels: ['openai/gpt-5.2-chat-latest'],
      },
    ],
    records,
    async list() {
      return [...records.values()]
    },
    async upsert(input) {
      const summary: ProviderSummary = {
        provider: input.provider,
        enabled: input.enabled ?? true,
        model: input.model,
        ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
        maskedKey: `••••${input.apiKey.slice(-4)}`,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }
      records.set(input.provider, summary)
      return summary
    },
    async setEnabled(provider, enabled) {
      const existing = records.get(provider)
      if (existing === undefined) throw new Error('not configured')
      const updated = { ...existing, enabled }
      records.set(provider, updated)
      return updated
    },
    async updateSettings(provider, patch) {
      const existing = records.get(provider)
      if (existing === undefined) throw new Error('not configured')
      const updated = { ...existing, ...patch }
      records.set(provider, updated)
      return updated
    },
    async remove(provider) {
      records.delete(provider)
    },
  }
}

describe('POST /api/providers', () => {
  it('refuses anyone below admin', async () => {
    const router = createProvidersRouter({ providers: fakeRegistry() })
    const response = await router.handle(
      { method: 'GET', path: '/api/providers', query: {} },
      EDITOR,
    )
    expect(response.status).toBe(403)
  })

  it('refuses an anonymous caller', async () => {
    const router = createProvidersRouter({ providers: fakeRegistry() })
    const response = await router.handle(
      { method: 'GET', path: '/api/providers', query: {} },
      ANONYMOUS,
    )
    expect(response.status).toBe(403)
  })

  it('saves a provider and never echoes the plaintext key back', async () => {
    const router = createProvidersRouter({ providers: fakeRegistry() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: { provider: 'anthropic', apiKey: 'sk-ant-secret-value', model: 'claude-sonnet' },
      },
      ADMIN,
    )
    expect(response.status).toBe(201)
    expect(JSON.stringify(response.body)).not.toContain('secret-value')
    expect(JSON.stringify(response.body)).toContain('maskedKey')
  })

  it('refuses a name outside the catalog with no baseUrl (fiche 56)', async () => {
    const router = createProvidersRouter({ providers: fakeRegistry() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: { provider: 'not-a-real-provider', apiKey: 'x', model: 'x' },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'PROVIDER_CUSTOM_BASE_URL_REQUIRED',
    )
  })

  it('accepts a name outside the catalog when a baseUrl is given (a custom OpenAI-compatible endpoint)', async () => {
    const router = createProvidersRouter({ providers: fakeRegistry() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: {
          provider: 'my-vllm-server',
          apiKey: 'sk-local',
          model: 'llama-3',
          baseUrl: 'https://vllm.internal/v1/chat/completions',
        },
      },
      ADMIN,
    )
    expect(response.status).toBe(201)
    expect((response.body as { data: ProviderSummary }).data.provider).toBe('my-vllm-server')
  })

  it('GET /api/providers/catalog lists the built-in catalog, admin-only', async () => {
    const router = createProvidersRouter({ providers: fakeRegistry() })
    const forbidden = await router.handle(
      { method: 'GET', path: '/api/providers/catalog', query: {} },
      EDITOR,
    )
    expect(forbidden.status).toBe(403)

    const response = await router.handle(
      { method: 'GET', path: '/api/providers/catalog', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: readonly { id: string }[] }
    expect(body.data.map((entry) => entry.id)).toContain('openrouter')
  })

  it('lists configured providers with masked keys', async () => {
    const registry = fakeRegistry()
    const router = createProvidersRouter({ providers: registry })
    await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: { provider: 'openai', apiKey: 'sk-oai-abcdef', model: 'gpt-5' },
      },
      ADMIN,
    )
    const response = await router.handle(
      { method: 'GET', path: '/api/providers', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { data: readonly ProviderSummary[] }
    expect(body.data).toEqual([
      expect.objectContaining({ provider: 'openai', maskedKey: '••••cdef' }),
    ])
  })

  it('PATCH toggles enabled without needing the key again', async () => {
    const registry = fakeRegistry()
    const router = createProvidersRouter({ providers: registry })
    await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: { provider: 'anthropic', apiKey: 'sk-ant-1', model: 'claude' },
      },
      ADMIN,
    )
    const response = await router.handle(
      {
        method: 'PATCH',
        path: '/api/providers/anthropic',
        query: {},
        body: { enabled: false },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: ProviderSummary }).data.enabled).toBe(false)
  })

  it('DELETE removes a provider', async () => {
    const registry = fakeRegistry()
    const router = createProvidersRouter({ providers: registry })
    await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: { provider: 'google', apiKey: 'sk-g-1', model: 'gemini' },
      },
      ADMIN,
    )
    const response = await router.handle(
      { method: 'DELETE', path: '/api/providers/google', query: {} },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(registry.records.has('google')).toBe(false)
  })
})
