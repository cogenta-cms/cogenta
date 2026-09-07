import { describe, expect, it, vi } from 'vitest'
import { createAnthropicClient } from '../../src/providers/anthropic.js'
import { createGoogleClient } from '../../src/providers/google.js'
import { createOpenAiClient } from '../../src/providers/openai.js'
import type { ChatRequest } from '../../src/providers/types.js'
import { TEST_TUNING_DEFAULTS } from './test-tuning-defaults.js'

const REQUEST: ChatRequest = {
  model: 'x',
  messages: [{ role: 'user', content: 'hi' }],
  maxTokens: 10,
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createAnthropicClient', () => {
  it('sends the api key header and parses a successful response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        content: [{ type: 'text', text: 'Hi.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      fetchImpl,
      defaults: TEST_TUNING_DEFAULTS,
    })

    const result = await client.chat(REQUEST)

    expect(result.content).toBe('Hi.')
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k')
  })

  it('throws PROVIDER_RATE_LIMITED on a 429', async () => {
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      fetchImpl: async () => jsonResponse(429, {}),
      defaults: TEST_TUNING_DEFAULTS,
    })

    await expect(client.chat(REQUEST)).rejects.toThrowError(/rate-limited/)
  })

  it('throws PROVIDER_REQUEST_FAILED on a non-ok status', async () => {
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      fetchImpl: async () => jsonResponse(500, {}),
      defaults: TEST_TUNING_DEFAULTS,
    })

    await expect(client.chat(REQUEST)).rejects.toThrowError(/status 500/)
  })

  it('throws PROVIDER_REQUEST_FAILED when the network call itself fails', async () => {
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      fetchImpl: async () => {
        throw new Error('ECONNRESET')
      },
      defaults: TEST_TUNING_DEFAULTS,
    })

    await expect(client.chat(REQUEST)).rejects.toThrowError(/could not be sent/)
  })

  it('always passes a signal, even when the caller supplies none', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return jsonResponse(200, {
        content: [{ type: 'text', text: 'Hi.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    })
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      fetchImpl,
      defaults: TEST_TUNING_DEFAULTS,
    })
    await client.chat(REQUEST)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reports the generic failure, not a timeout, when the caller’s own signal is what aborted', async () => {
    // Reproduces the distinction the fix relies on: the combined signal is
    // aborted either way, so the client must check *why* before naming a
    // timeout it never actually hit.
    const caller = new AbortController()
    caller.abort()
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      fetchImpl: async () => {
        throw new DOMException('The operation was aborted.', 'AbortError')
      },
      defaults: TEST_TUNING_DEFAULTS,
    })

    await expect(client.chat(REQUEST, { signal: caller.signal })).rejects.toThrowError(
      /could not be sent/,
    )
  })

  // Per-provider model tuning: an admin-set property of *this* provider
  // (`/admin/providers`), resolved once at construction, never a number a
  // call site has to guess — the exact bug (a fixed budget too small for a
  // reasoning-tier model's hidden "thinking" tokens) this exists to fix.
  it('reports the configured maxOutputTokens/requestTimeoutMs/maxCorrectionAttempts on the client, and falls back to the built-in default for a request that sets no maxTokens of its own', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        content: [{ type: 'text', text: 'Hi.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      fetchImpl,
      maxOutputTokens: 12000,
      requestTimeoutMs: 240_000,
      maxCorrectionAttempts: 5,
      defaults: TEST_TUNING_DEFAULTS,
    })

    expect(client.maxOutputTokens).toBe(12000)
    expect(client.requestTimeoutMs).toBe(240_000)
    expect(client.maxCorrectionAttempts).toBe(5)

    await client.chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }] })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as { max_tokens: number }
    expect(sentBody.max_tokens).toBe(12000)
  })

  it('falls back to the site-wide defaults when the admin never set a per-provider override', () => {
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      defaults: TEST_TUNING_DEFAULTS,
    })
    expect(client.maxOutputTokens).toBe(TEST_TUNING_DEFAULTS.maxOutputTokens)
    expect(client.requestTimeoutMs).toBe(TEST_TUNING_DEFAULTS.requestTimeoutMs)
    expect(client.maxCorrectionAttempts).toBe(TEST_TUNING_DEFAULTS.maxCorrectionAttempts)
  })

  it('an explicit request.maxTokens still wins over the client-level default', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        content: [{ type: 'text', text: 'Hi.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      fetchImpl,
      maxOutputTokens: 12000,
      defaults: TEST_TUNING_DEFAULTS,
    })
    await client.chat({ ...REQUEST, maxTokens: 42 })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as { max_tokens: number }
    expect(sentBody.max_tokens).toBe(42)
  })
})

describe('createOpenAiClient', () => {
  it('sends a bearer token and parses a successful response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        choices: [{ message: { content: 'Hi.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    )
    const client = createOpenAiClient({
      apiKey: 'k',
      model: 'gpt-5',
      fetchImpl,
      defaults: TEST_TUNING_DEFAULTS,
    })

    const result = await client.chat(REQUEST)

    expect(result.content).toBe('Hi.')
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('applies the configured maxOutputTokens to a request that sets none of its own — the DeepSeek reasoning-model fix', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        choices: [{ message: { content: 'Hi.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    )
    const client = createOpenAiClient({
      apiKey: 'k',
      model: 'deepseek-v4-flash',
      name: 'deepseek',
      fetchImpl,
      maxOutputTokens: 12000,
      defaults: TEST_TUNING_DEFAULTS,
    })
    expect(client.maxOutputTokens).toBe(12000)
    await client.chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }] })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as { max_tokens: number }
    expect(sentBody.max_tokens).toBe(12000)
  })

  // Fiche feedback, 2026-09-07: a real gpt-5-mini request carrying
  // max_tokens was rejected outright by OpenAI — confirmed live. This is
  // the wiring test: `usesMaxCompletionTokens` on the client config actually
  // changes what field name reaches the wire, not just what
  // `buildOpenAiRequest` returns in isolation.
  it('sends max_completion_tokens, not max_tokens, when usesMaxCompletionTokens is set (the gpt-5 fix)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        choices: [{ message: { content: 'Hi.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    )
    const client = createOpenAiClient({
      apiKey: 'k',
      model: 'gpt-5-mini',
      name: 'openai',
      fetchImpl,
      usesMaxCompletionTokens: true,
      maxOutputTokens: 16000,
      defaults: TEST_TUNING_DEFAULTS,
    })
    await client.chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }] })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as {
      max_tokens?: number
      max_completion_tokens?: number
    }
    expect(sentBody.max_completion_tokens).toBe(16000)
    expect(sentBody.max_tokens).toBeUndefined()
  })
})

describe('createGoogleClient', () => {
  it('puts the api key in the query string and parses a successful response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'Hi.' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      }),
    )
    const client = createGoogleClient({
      apiKey: 'k',
      model: 'gemini-3-pro',
      fetchImpl,
      defaults: TEST_TUNING_DEFAULTS,
    })

    const result = await client.chat(REQUEST)

    expect(result.content).toBe('Hi.')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('key=k')
    expect(url).toContain('gemini-3-pro:generateContent')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('applies the configured maxOutputTokens to generationConfig for a request that sets none of its own', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'Hi.' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      }),
    )
    const client = createGoogleClient({
      apiKey: 'k',
      model: 'gemini-3-pro',
      fetchImpl,
      maxOutputTokens: 12000,
      defaults: TEST_TUNING_DEFAULTS,
    })
    await client.chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }] })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as {
      generationConfig: { maxOutputTokens: number }
    }
    expect(sentBody.generationConfig.maxOutputTokens).toBe(12000)
  })
})
