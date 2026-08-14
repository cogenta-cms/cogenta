import { CogentaError } from '@cogenta/core'
import { runEvalSuite } from './run-suite.js'
import type { EvalCase, EvalReport } from './types.js'

export interface EvalThresholdOptions {
  /** The suite's `meanScore` must be at least this, or the assertion throws. */
  readonly minMeanScore: number
}

/**
 * "Harnais d'évaluation et intégration CI" (L5 task 2): no new CI
 * infrastructure needed — a throw from an `it()` block already fails
 * `pnpm test`, which the `unit` job already runs on every push and PR. An
 * agent's eval suite becomes a normal test file (`*.eval.test.ts`) that
 * calls this once; "une régression au-delà d'un seuil échoue la CI" is then
 * just what a failing test already does.
 */
export async function assertEvalThreshold(
  cases: readonly EvalCase[],
  options: EvalThresholdOptions,
): Promise<EvalReport> {
  const report = await runEvalSuite(cases)
  if (report.meanScore < options.minMeanScore) {
    throw new CogentaError({
      code: 'EVAL_THRESHOLD_NOT_MET',
      message: `Eval suite scored ${report.meanScore.toFixed(3)}, below the required ${options.minMeanScore}.`,
      hint: 'Either the prompt or model regressed, or the threshold needs a deliberate, reviewed change — never a silent one.',
      details: {
        meanScore: report.meanScore,
        minMeanScore: options.minMeanScore,
        results: report.results,
      },
    })
  }
  return report
}
