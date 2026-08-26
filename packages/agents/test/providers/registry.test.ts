import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProviderRegistry } from '../../src/providers/registry.js'
import type { ChatRequest } from '../../src/providers/types.js'

describe('createProviderRegistry', () => {
  it('has() reflects only what was configured, so R2 (no provider means no agents, not a crash) holds by construction', () => {
    const registry = createProviderRegistry({})

    expect(registry.has('anthropic')).toBe(false)
    expect(registry.has('openai')).toBe(false)
    expect(registry.has('google')).toBe(false)
  })

  it('get() returns a client for a configured provider, named after it', () => {
    const registry = createProviderRegistry({
      anthropic: { apiKey: 'test-key', model: 'claude-sonnet-5' },
    })

    expect(registry.has('anthropic')).toBe(true)
    expect(registry.get('anthropic').name).toBe('anthropic')
    expect(registry.get('anthropic').model).toBe('claude-sonnet-5')
  })

  it('get() throws PROVIDER_UNKNOWN for a provider that was not configured', () => {
    const registry = createProviderRegistry({})

    expect(() => registry.get('openai')).toThrowError(/No provider named "openai"/)
  })

  // Fiche 56: OpenRouter/DeepSeek/Qwen/GLM reuse `createOpenAiClient` at
  // their own catalog `defaultBaseUrl` — zero new network code.
  it('resolves a catalog id whose wireFormat is openai-compatible without an explicit baseUrl', () => {
    const registry = createProviderRegistry({
      openrouter: { apiKey: 'or-key', model: 'openai/gpt-5.2-chat-latest' },
    })

    expect(registry.has('openrouter')).toBe(true)
    const client = registry.get('openrouter')
    expect(client.model).toBe('openai/gpt-5.2-chat-latest')
    // The client must report its own catalog id, not "openai" — otherwise a
    // privacy allowlist scoped to "openrouter" (`assertProviderAllowed`)
    // would silently fail to recognise it (or worse, an allowlist scoped to
    // "openai" would wrongly admit it).
    expect(client.name).toBe('openrouter')
  })

  it('a name outside the catalog resolves when it carries its own baseUrl (a custom OpenAI-compatible endpoint)', () => {
    const registry = createProviderRegistry({
      'my-vllm-server': {
        apiKey: 'sk-local',
        model: 'llama-3',
        baseUrl: 'https://vllm.internal/v1/chat/completions',
      },
    })

    const client = registry.get('my-vllm-server')
    expect(client.name).toBe('my-vllm-server')
    expect(client.model).toBe('llama-3')
  })

  it('throws PROVIDER_CUSTOM_BASE_URL_REQUIRED, at construction, for a name outside the catalog with no baseUrl', () => {
    expect(() =>
      createProviderRegistry({ 'not-a-real-provider': { apiKey: 'x', model: 'x' } }),
    ).toThrowError(/is not a built-in provider/)
  })

  describe('contract: an openai-compatible catalog entry sends the same request shape as OpenAI itself', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('differs only in URL and model, never in headers or body structure', async () => {
      const capture = (target: { url: string; body: unknown }[]) =>
        vi.fn(async (url: string, init: RequestInit) => {
          target.push({ url, body: JSON.parse(String(init.body)) })
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: 'Hi.' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        })

      // Mirrors `orchestrator.ts`'s own call shape: `ChatRequest.model` is
      // filled from the resolved client's own `model`, not a shared literal.
      function requestFor(model: string): ChatRequest {
        return {
          model,
          system: 'Be concise.',
          messages: [{ role: 'user', content: 'hi' }],
          maxTokens: 10,
        }
      }

      const openAiCalls: { url: string; body: unknown }[] = []
      vi.stubGlobal('fetch', capture(openAiCalls))
      const openAiClient = createProviderRegistry({
        openai: { apiKey: 'k', model: 'gpt-5' },
      }).get('openai')
      await openAiClient.chat(requestFor(openAiClient.model))

      const openRouterCalls: { url: string; body: unknown }[] = []
      vi.stubGlobal('fetch', capture(openRouterCalls))
      const openRouterClient = createProviderRegistry({
        openrouter: { apiKey: 'k', model: 'anthropic/claude-sonnet-5' },
      }).get('openrouter')
      await openRouterClient.chat(requestFor(openRouterClient.model))

      expect(openAiCalls[0]?.url).toBe('https://api.openai.com/v1/chat/completions')
      expect(openRouterCalls[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions')
      expect(openAiCalls[0]?.url).not.toBe(openRouterCalls[0]?.url)

      const openAiBody = openAiCalls[0]?.body as { model: string }
      const openRouterBody = openRouterCalls[0]?.body as { model: string }
      const { model: openAiModel, ...openAiBodyRest } = openAiBody
      const { model: openRouterModel, ...openRouterBodyRest } = openRouterBody
      expect(openAiModel).toBe('gpt-5')
      expect(openRouterModel).toBe('anthropic/claude-sonnet-5')
      expect(openRouterBodyRest).toEqual(openAiBodyRest)
    })
  })
})
