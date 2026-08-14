import { describe, expect, it } from 'vitest'
import { runEvalSuite } from '../../src/eval/run-suite.js'
import type { EvalCase } from '../../src/eval/types.js'
import type { ChatResponse, ProviderClient } from '../../src/providers/types.js'

const USAGE = { inputTokens: 10, outputTokens: 5 }

function fakeClient(responses: readonly ChatResponse[]): ProviderClient {
  let index = 0
  return {
    name: 'fake',
    model: 'fake-model',
    async chat() {
      const response = responses[index]
      index += 1
      if (response === undefined) throw new Error('fakeClient: ran out of scripted responses')
      return response
    },
  }
}

function textResponse(text: string): ChatResponse {
  return { content: text, toolCalls: [], stopReason: 'end_turn', usage: USAGE }
}

describe('runEvalSuite', () => {
  it('scores each case with its own score() against its own run result', async () => {
    const cases: EvalCase[] = [
      {
        name: 'greets-politely',
        input: { client: fakeClient([textResponse('Hello there!')]), messages: [], maxTokens: 100 },
        score: (result) => (result.finalText?.includes('Hello') === true ? 1 : 0),
      },
      {
        name: 'fails-to-greet',
        input: { client: fakeClient([textResponse('Get lost.')]), messages: [], maxTokens: 100 },
        score: (result) => (result.finalText?.includes('Hello') === true ? 1 : 0),
      },
    ]

    const report = await runEvalSuite(cases)

    expect(report.results).toEqual([
      { name: 'greets-politely', score: 1, stopReason: 'end_turn', usage: USAGE },
      { name: 'fails-to-greet', score: 0, stopReason: 'end_turn', usage: USAGE },
    ])
    expect(report.meanScore).toBe(0.5)
  })

  it('awaits an async score() function', async () => {
    const cases: EvalCase[] = [
      {
        name: 'async-score',
        input: { client: fakeClient([textResponse('ok')]), messages: [], maxTokens: 100 },
        score: async (result) => (result.finalText === 'ok' ? 0.75 : 0),
      },
    ]

    const report = await runEvalSuite(cases)

    expect(report.results[0]?.score).toBe(0.75)
  })

  it('reports a mean score of 0 for an empty case list', async () => {
    const report = await runEvalSuite([])
    expect(report).toEqual({ results: [], meanScore: 0 })
  })
})
