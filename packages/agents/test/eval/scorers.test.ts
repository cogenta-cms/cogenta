import { describe, expect, it } from 'vitest'
import {
  scoreFinalTextIncludes,
  scoreStopReason,
  scoreToolSequence,
} from '../../src/eval/scorers.js'
import type { RunResult, StepRecord } from '../../src/runtime/types.js'

const USAGE = { inputTokens: 0, outputTokens: 0 }

function resultWithText(finalText: string | null): RunResult {
  return { messages: [], steps: [], finalText, stopReason: 'end_turn', usage: USAGE }
}

function stepCalling(toolName: string): StepRecord {
  return {
    response: { role: 'assistant' },
    usage: USAGE,
    toolOutcomes: [{ call: { id: '1', name: toolName, input: {} }, ok: true, output: '' }],
  }
}

function resultWithSteps(
  steps: readonly StepRecord[],
  stopReason: RunResult['stopReason'] = 'end_turn',
): RunResult {
  return { messages: [], steps, finalText: null, stopReason, usage: USAGE }
}

describe('scoreFinalTextIncludes', () => {
  it('scores 1 when the substring is present', () => {
    expect(scoreFinalTextIncludes('hello')(resultWithText('well, hello there'))).toBe(1)
  })

  it('scores 0 when the substring is absent', () => {
    expect(scoreFinalTextIncludes('hello')(resultWithText('goodbye'))).toBe(0)
  })

  it('scores 0 when finalText is null', () => {
    expect(scoreFinalTextIncludes('hello')(resultWithText(null))).toBe(0)
  })
})

describe('scoreToolSequence', () => {
  it('scores 1 for an exact match, in order', () => {
    const result = resultWithSteps([stepCalling('a'), stepCalling('b')])
    expect(scoreToolSequence(['a', 'b'])(result)).toBe(1)
  })

  it('scores partial credit for a partial subsequence match', () => {
    const result = resultWithSteps([stepCalling('a')])
    expect(scoreToolSequence(['a', 'b'])(result)).toBe(0.5)
  })

  it('scores 0 when none of the expected tools were called', () => {
    const result = resultWithSteps([stepCalling('x')])
    expect(scoreToolSequence(['a', 'b'])(result)).toBe(0)
  })

  it('scores 1 for an empty expectation regardless of what was called', () => {
    const result = resultWithSteps([stepCalling('x')])
    expect(scoreToolSequence([])(result)).toBe(1)
  })

  it('ignores extra calls that are not part of the expected sequence', () => {
    const result = resultWithSteps([
      stepCalling('noise'),
      stepCalling('a'),
      stepCalling('noise'),
      stepCalling('b'),
    ])
    expect(scoreToolSequence(['a', 'b'])(result)).toBe(1)
  })
})

describe('scoreStopReason', () => {
  it('scores 1 when the stop reason matches', () => {
    expect(scoreStopReason('end_turn')(resultWithSteps([], 'end_turn'))).toBe(1)
  })

  it('scores 0 when the stop reason does not match', () => {
    expect(scoreStopReason('end_turn')(resultWithSteps([], 'max_steps'))).toBe(0)
  })
})
