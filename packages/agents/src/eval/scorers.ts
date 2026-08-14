import type { RunResult } from '../runtime/types.js'

function calledToolNames(result: RunResult): readonly string[] {
  return result.steps.flatMap((step) => step.toolOutcomes.map((outcome) => outcome.call.name))
}

/** 1 when the run's final text contains `substring` (case-sensitive), 0 otherwise — a `null` finalText always scores 0. */
export function scoreFinalTextIncludes(substring: string): (result: RunResult) => number {
  return (result) => (result.finalText?.includes(substring) === true ? 1 : 0)
}

/**
 * The fraction of `expectedToolNames`, in order, that appear as a
 * subsequence of the tools the run actually called — 1.0 for an exact or
 * superset match in the right order, partial credit for a partial match,
 * 0 for none.
 */
export function scoreToolSequence(
  expectedToolNames: readonly string[],
): (result: RunResult) => number {
  return (result) => {
    if (expectedToolNames.length === 0) return 1
    const called = calledToolNames(result)
    let expectedIndex = 0
    for (const name of called) {
      if (name === expectedToolNames[expectedIndex]) expectedIndex += 1
      if (expectedIndex === expectedToolNames.length) break
    }
    return expectedIndex / expectedToolNames.length
  }
}

/** 1 when the run stopped for the given reason, 0 otherwise — useful to penalise e.g. `max_steps` or `repetition_detected` outcomes. */
export function scoreStopReason(expected: RunResult['stopReason']): (result: RunResult) => number {
  return (result) => (result.stopReason === expected ? 1 : 0)
}
