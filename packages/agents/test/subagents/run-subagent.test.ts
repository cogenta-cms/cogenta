import { describe, expect, it } from 'vitest'
import type { ChatRequest, ChatResponse, ProviderClient } from '../../src/providers/types.js'
import { runSubagent } from '../../src/subagents/run-subagent.js'

const USAGE = { inputTokens: 10, outputTokens: 5 }

function fakeClient(responses: readonly ChatResponse[]): ProviderClient {
  let index = 0
  return {
    name: 'fake',
    model: 'fake-model',
    async chat(_request: ChatRequest) {
      const response = responses[index]
      index += 1
      if (response === undefined) throw new Error('fakeClient: ran out of scripted responses')
      return response
    },
  }
}

function failingClient(): ProviderClient {
  return {
    name: 'fake',
    model: 'fake-model',
    async chat() {
      throw new Error('provider is down')
    },
  }
}

describe('runSubagent', () => {
  it('returns the sub-agent’s own run result on success', async () => {
    const client = fakeClient([
      { content: 'Done.', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
    ])

    const result = await runSubagent({
      client,
      messages: [{ role: 'user', content: 'triage this CVE' }],
      maxTokens: 100,
    })

    expect(result.stopReason).toBe('end_turn')
    expect(result.finalText).toBe('Done.')
    expect(result.error).toBeUndefined()
  })

  it('turns a thrown failure into an "errored" result instead of throwing', async () => {
    const client = failingClient()

    const result = await runSubagent({
      client,
      messages: [{ role: 'user', content: 'triage this CVE' }],
      maxTokens: 100,
      maxAttempts: 1,
    })

    expect(result.stopReason).toBe('errored')
    expect(result.finalText).toBeNull()
    expect(result.error).toMatch(/provider is down/)
  })
})
