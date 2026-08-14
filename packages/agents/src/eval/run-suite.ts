import { runAgentLoop } from '../runtime/loop.js'
import type { EvalCase, EvalCaseResult, EvalReport } from './types.js'

/** Runs every case's own `input` through `runAgentLoop`, scores its result with the case's own `score()`, and reports the mean — the "harnais d'évaluation" itself. */
export async function runEvalSuite(cases: readonly EvalCase[]): Promise<EvalReport> {
  const results: EvalCaseResult[] = []
  for (const evalCase of cases) {
    const result = await runAgentLoop(evalCase.input)
    const score = await evalCase.score(result)
    results.push({
      name: evalCase.name,
      score,
      stopReason: result.stopReason,
      usage: result.usage,
    })
  }

  const meanScore =
    results.length === 0 ? 0 : results.reduce((sum, entry) => sum + entry.score, 0) / results.length

  return { results, meanScore }
}
