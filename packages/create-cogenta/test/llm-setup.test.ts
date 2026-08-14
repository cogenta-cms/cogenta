import { describe, expect, it } from 'vitest'
import { LLM_PROVIDERS, validateApiKey } from '../src/llm-setup.js'

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
}

const ANTHROPIC_OK_BODY = {
  content: [{ type: 'text', text: 'pong' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1, output_tokens: 1 },
}

describe('LLM_PROVIDERS', () => {
  it('lists "none" first — the CMS works without one', () => {
    expect(LLM_PROVIDERS[0]?.id).toBe('none')
  })
})

describe('validateApiKey', () => {
  it('reports valid on a successful round trip, with no network call reaching the real API', async () => {
    const result = await validateApiKey({
      provider: 'anthropic',
      apiKey: 'sk-test',
      model: 'claude-sonnet-5',
      fetchImpl: fakeFetch(200, ANTHROPIC_OK_BODY),
    })

    expect(result).toEqual({ valid: true })
  })

  it('reports invalid, with a reason, when the provider rejects the key', async () => {
    const result = await validateApiKey({
      provider: 'anthropic',
      apiKey: 'sk-bad',
      model: 'claude-sonnet-5',
      fetchImpl: fakeFetch(401, { error: { message: 'invalid x-api-key' } }),
    })

    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('reports invalid when the request itself fails', async () => {
    const failingFetch = (async () => {
      throw new TypeError('network down')
    }) as typeof fetch

    const result = await validateApiKey({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-5',
      fetchImpl: failingFetch,
    })

    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })
})
