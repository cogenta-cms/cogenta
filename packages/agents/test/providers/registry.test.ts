import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProviderRegistry } from '../../src/providers/registry.js'
import type { ChatRequest } from '../../src/providers/types.js'
import { TEST_TUNING_DEFAULTS } from './test-tuning-defaults.js'

describe('createProviderRegistry', () => {
  it('has() reflects only what was configured, so R2 (no provider means no agents, not a crash) holds by construction', () => {
    const registry = createProviderRegistry({}, TEST_TUNING_DEFAULTS)

    expect(registry.has('anthropic')).toBe(false)
    expect(registry.has('openai')).toBe(false)
    expect(registry.has('google')).toBe(false)
  })

  it('get() returns a client for a configured provider, named after it', () => {
    const registry = createProviderRegistry(
      { anthropic: { apiKey: 'test-key', model: 'claude-sonnet-5' } },
      TEST_TUNING_DEFAULTS,
    )

    expect(registry.has('anthropic')).toBe(true)
    expect(registry.get('anthropic').name).toBe('anthropic')
    expect(registry.get('anthropic').model).toBe('claude-sonnet-5')
  })

  it('get() throws PROVIDER_UNKNOWN for a provider that was not configured', () => {
    const registry = createProviderRegistry({}, TEST_TUNING_DEFAULTS)

    expect(() => registry.get('openai')).toThrowError(/No provider named "openai"/)
  })

  // Fiche 56: OpenRouter/DeepSeek/Qwen/GLM reuse `createOpenAiClient` at
  // their own catalog `defaultBaseUrl` — zero new network code.
  it('resolves a catalog id whose wireFormat is openai-compatible without an explicit baseUrl', () => {
    const registry = createProviderRegistry(
      { openrouter: { apiKey: 'or-key', model: 'openai/gpt-5.2-chat-latest' } },
      TEST_TUNING_DEFAULTS,
    )

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
    const registry = createProviderRegistry(
      {
        'my-vllm-server': {
          apiKey: 'sk-local',
          model: 'llama-3',
          baseUrl: 'https://vllm.internal/v1/chat/completions',
        },
      },
      TEST_TUNING_DEFAULTS,
    )

    const client = registry.get('my-vllm-server')
    expect(client.name).toBe('my-vllm-server')
    expect(client.model).toBe('llama-3')
  })

  it('throws PROVIDER_CUSTOM_BASE_URL_REQUIRED, at construction, for a name outside the catalog with no baseUrl', () => {
    expect(() =>
      createProviderRegistry(
        { 'not-a-real-provider': { apiKey: 'x', model: 'x' } },
        TEST_TUNING_DEFAULTS,
      ),
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
      const openAiClient = createProviderRegistry(
        { openai: { apiKey: 'k', model: 'gpt-5' } },
        TEST_TUNING_DEFAULTS,
      ).get('openai')
      await openAiClient.chat(requestFor(openAiClient.model))

      const openRouterCalls: { url: string; body: unknown }[] = []
      vi.stubGlobal('fetch', capture(openRouterCalls))
      const openRouterClient = createProviderRegistry(
        { openrouter: { apiKey: 'k', model: 'anthropic/claude-sonnet-5' } },
        TEST_TUNING_DEFAULTS,
      ).get('openrouter')
      await openRouterClient.chat(requestFor(openRouterClient.model))

      expect(openAiCalls[0]?.url).toBe('https://api.openai.com/v1/chat/completions')
      expect(openRouterCalls[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions')
      expect(openAiCalls[0]?.url).not.toBe(openRouterCalls[0]?.url)

      const openAiBody = openAiCalls[0]?.body as {
        model: string
        max_tokens?: number
        max_completion_tokens?: number
      }
      const openRouterBody = openRouterCalls[0]?.body as {
        model: string
        max_tokens?: number
        max_completion_tokens?: number
      }
      expect(openAiBody.model).toBe('gpt-5')
      expect(openRouterBody.model).toBe('anthropic/claude-sonnet-5')
      // The one deliberate difference (fiche feedback, 2026-09-07): OpenAI's
      // own reasoning-tier models reject `max_tokens` outright, so only the
      // genuine `openai` catalog entry sends `max_completion_tokens`
      // instead — everything else about the two requests still matches.
      expect(openAiBody.max_completion_tokens).toBe(10)
      expect(openAiBody.max_tokens).toBeUndefined()
      expect(openRouterBody.max_tokens).toBe(10)
      expect(openRouterBody.max_completion_tokens).toBeUndefined()

      const {
        model: openAiModel,
        max_tokens: _oaMaxTokens,
        max_completion_tokens: _oaMaxCompletionTokens,
        ...openAiBodyRest
      } = openAiBody
      const {
        model: openRouterModel,
        max_tokens: _orMaxTokens,
        max_completion_tokens: _orMaxCompletionTokens,
        ...openRouterBodyRest
      } = openRouterBody
      void openAiModel
      void openRouterModel
      expect(openRouterBodyRest).toEqual(openAiBodyRest)
    })
  })
})
