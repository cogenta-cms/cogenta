import { describe, expect, it } from 'vitest'
import { assertEvalThreshold } from '../../src/eval/assert-threshold.js'
import type { EvalCase } from '../../src/eval/types.js'
import type { ChatResponse, ProviderClient } from '../../src/providers/types.js'

const USAGE = { inputTokens: 10, outputTokens: 5 }

function fakeClient(response: ChatResponse): ProviderClient {
  return {
    name: 'fake',
    model: 'fake-model',
    async chat() {
      return response
    },
  }
}

function caseScoring(score: number): EvalCase {
  return {
    name: 'case',
    input: {
      client: fakeClient({ content: 'ok', toolCalls: [], stopReason: 'end_turn', usage: USAGE }),
      messages: [],
      maxTokens: 100,
    },
    score: () => score,
  }
}

describe('assertEvalThreshold', () => {
  it('resolves with the report when the mean score meets the threshold', async () => {
    const report = await assertEvalThreshold([caseScoring(0.9), caseScoring(0.8)], {
      minMeanScore: 0.8,
    })
    expect(report.meanScore).toBeCloseTo(0.85)
  })

  it('throws EVAL_THRESHOLD_NOT_MET when the mean score falls short', async () => {
    await expect(
      assertEvalThreshold([caseScoring(0.4), caseScoring(0.3)], { minMeanScore: 0.8 }),
    ).rejects.toThrowError(/scored 0\.350, below the required 0\.8/)
  })

  it('treats an exact match to the threshold as passing', async () => {
    await expect(
      assertEvalThreshold([caseScoring(0.8)], { minMeanScore: 0.8 }),
    ).resolves.toMatchObject({ meanScore: 0.8 })
  })
})
