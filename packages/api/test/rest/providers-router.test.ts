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
        ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
        ...(input.requestTimeoutMs === undefined
          ? {}
          : { requestTimeoutMs: input.requestTimeoutMs }),
        ...(input.maxCorrectionAttempts === undefined
          ? {}
          : { maxCorrectionAttempts: input.maxCorrectionAttempts }),
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
      // Mirrors the real store's tri-state: `undefined` (key not in patch)
      // keeps the saved value, `null` clears it, a number sets it.
      function resolved(
        patched: number | null | undefined,
        current: number | undefined,
      ): number | undefined {
        if (patched === undefined) return current
        return patched === null ? undefined : patched
      }
      const {
        maxOutputTokens: _mot,
        requestTimeoutMs: _rtm,
        maxCorrectionAttempts: _mca,
        ...rest
      } = existing
      const maxOutputTokens = resolved(patch.maxOutputTokens, existing.maxOutputTokens)
      const requestTimeoutMs = resolved(patch.requestTimeoutMs, existing.requestTimeoutMs)
      const maxCorrectionAttempts = resolved(
        patch.maxCorrectionAttempts,
        existing.maxCorrectionAttempts,
      )
      const updated: ProviderSummary = {
        ...rest,
        model: patch.model ?? existing.model,
        ...(patch.baseUrl === undefined
          ? existing.baseUrl === undefined
            ? {}
            : { baseUrl: existing.baseUrl }
          : { baseUrl: patch.baseUrl }),
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(maxCorrectionAttempts === undefined ? {} : { maxCorrectionAttempts }),
      }
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

  // Every one of these three used to be a number hardcoded per call site,
  // with no admin surface — this is the write boundary that makes them a
  // real, saved property of the provider instead.
  it('saves maxOutputTokens/requestTimeoutMs/maxCorrectionAttempts and reflects them back', async () => {
    const router = createProvidersRouter({ providers: fakeRegistry() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: {
          provider: 'deepseek',
          apiKey: 'sk-1',
          model: 'deepseek-v4-flash',
          maxOutputTokens: 12000,
          requestTimeoutMs: 240_000,
          maxCorrectionAttempts: 5,
        },
      },
      ADMIN,
    )
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      data: { maxOutputTokens: 12000, requestTimeoutMs: 240_000, maxCorrectionAttempts: 5 },
    })
  })

  it('leaves the tuning fields unset when the caller sends none of them', async () => {
    const router = createProvidersRouter({ providers: fakeRegistry() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: { provider: 'anthropic', apiKey: 'sk-1', model: 'claude-sonnet' },
      },
      ADMIN,
    )
    expect(response.status).toBe(201)
    const data = (response.body as { data: Record<string, unknown> }).data
    expect(data.maxOutputTokens).toBeUndefined()
  })

  it('rejects a non-numeric maxOutputTokens with PROVIDER_TUNING_INVALID', async () => {
    const router = createProvidersRouter({ providers: fakeRegistry() })
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: {
          provider: 'anthropic',
          apiKey: 'sk-1',
          model: 'claude-sonnet',
          maxOutputTokens: 'a lot',
        },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'PROVIDER_TUNING_INVALID',
    )
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

  // fiche feedback: a saved provider's row had no way to change its own
  // tuning without re-pasting the API key — PATCH is the fix.
  it('PATCH changes maxOutputTokens/requestTimeoutMs/maxCorrectionAttempts without needing the key again', async () => {
    const registry = fakeRegistry()
    const router = createProvidersRouter({ providers: registry })
    await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: { provider: 'deepseek', apiKey: 'sk-1', model: 'deepseek-v4-flash' },
      },
      ADMIN,
    )
    const response = await router.handle(
      {
        method: 'PATCH',
        path: '/api/providers/deepseek',
        query: {},
        body: { maxOutputTokens: 20000, requestTimeoutMs: 300_000, maxCorrectionAttempts: 4 },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: ProviderSummary }).data).toMatchObject({
      maxOutputTokens: 20000,
      requestTimeoutMs: 300_000,
      maxCorrectionAttempts: 4,
    })
  })

  it('PATCH with an empty maxOutputTokens clears it back to "use the built-in default"', async () => {
    const registry = fakeRegistry()
    const router = createProvidersRouter({ providers: registry })
    await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: {
          provider: 'deepseek',
          apiKey: 'sk-1',
          model: 'deepseek-v4-flash',
          maxOutputTokens: 20000,
        },
      },
      ADMIN,
    )
    const response = await router.handle(
      {
        method: 'PATCH',
        path: '/api/providers/deepseek',
        query: {},
        body: { maxOutputTokens: '' },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: ProviderSummary }).data.maxOutputTokens).toBeUndefined()
  })

  it('PATCH refuses anyone below admin', async () => {
    const registry = fakeRegistry()
    const router = createProvidersRouter({ providers: registry })
    await router.handle(
      {
        method: 'POST',
        path: '/api/providers',
        query: {},
        body: { provider: 'anthropic', apiKey: 'sk-1', model: 'claude' },
      },
      ADMIN,
    )
    const response = await router.handle(
      {
        method: 'PATCH',
        path: '/api/providers/anthropic',
        query: {},
        body: { maxOutputTokens: 20000 },
      },
      EDITOR,
    )
    expect(response.status).toBe(403)
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
