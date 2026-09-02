import { describe, expect, it, vi } from 'vitest'
import { createAnthropicClient } from '../../src/providers/anthropic.js'
import { createGoogleClient } from '../../src/providers/google.js'
import { createOpenAiClient } from '../../src/providers/openai.js'
import type { ChatRequest } from '../../src/providers/types.js'

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
    const client = createAnthropicClient({ apiKey: 'k', model: 'claude-sonnet-5', fetchImpl })

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
    })

    await expect(client.chat(REQUEST)).rejects.toThrowError(/rate-limited/)
  })

  it('throws PROVIDER_REQUEST_FAILED on a non-ok status', async () => {
    const client = createAnthropicClient({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      fetchImpl: async () => jsonResponse(500, {}),
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
    const client = createAnthropicClient({ apiKey: 'k', model: 'claude-sonnet-5', fetchImpl })
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
    })

    await expect(client.chat(REQUEST, { signal: caller.signal })).rejects.toThrowError(
      /could not be sent/,
    )
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
    const client = createOpenAiClient({ apiKey: 'k', model: 'gpt-5', fetchImpl })

    const result = await client.chat(REQUEST)

    expect(result.content).toBe('Hi.')
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k')
    expect(init.signal).toBeInstanceOf(AbortSignal)
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
    const client = createGoogleClient({ apiKey: 'k', model: 'gemini-3-pro', fetchImpl })

    const result = await client.chat(REQUEST)

    expect(result.content).toBe('Hi.')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('key=k')
    expect(url).toContain('gemini-3-pro:generateContent')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})
