import { describe, expect, it } from 'vitest'
import { comparePromptVersions } from '../../src/eval/compare-prompt-versions.js'
import type { EvalCase } from '../../src/eval/types.js'
import type { ChatRequest, ChatResponse, ProviderClient } from '../../src/providers/types.js'

const USAGE = { inputTokens: 10, outputTokens: 5 }

/** Echoes the request's system prompt back as the response text — lets a test assert which prompt version actually reached the model. */
function systemEchoingClient(): ProviderClient {
  return {
    name: 'fake',
    model: 'fake-model',
    async chat(request: ChatRequest): Promise<ChatResponse> {
      return {
        content: request.system ?? '(no system)',
        toolCalls: [],
        stopReason: 'end_turn',
        usage: USAGE,
      }
    },
  }
}

describe('comparePromptVersions', () => {
  it('replays the same cases once per prompt version, overriding each case’s own system prompt', async () => {
    const cases: EvalCase[] = [
      {
        name: 'case-1',
        input: { client: systemEchoingClient(), messages: [], system: 'original', maxTokens: 100 },
        score: (result) => (result.finalText === 'polite and thorough' ? 1 : 0),
      },
    ]

    const comparisons = await comparePromptVersions(cases, [
      { name: 'v1-terse', system: 'be terse' },
      { name: 'v2-polite', system: 'polite and thorough' },
    ])

    expect(comparisons).toHaveLength(2)
    expect(comparisons[0]).toMatchObject({ version: 'v1-terse', report: { meanScore: 0 } })
    expect(comparisons[1]).toMatchObject({ version: 'v2-polite', report: { meanScore: 1 } })
  })
})
