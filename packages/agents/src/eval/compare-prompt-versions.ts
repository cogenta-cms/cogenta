import { runEvalSuite } from './run-suite.js'
import type { EvalCase, EvalReport } from './types.js'

export interface PromptVersion {
  readonly name: string
  readonly system: string
}

export interface PromptComparisonResult {
  readonly version: string
  readonly report: EvalReport
}

/**
 * The other half of "score comparé entre versions de prompt": the same case
 * set, replayed once per named prompt (`version.system` overrides each
 * case's own `input.system`), so the resulting `EvalReport`s are directly
 * comparable — same cases, same scorers, only the prompt changed.
 */
export async function comparePromptVersions(
  cases: readonly EvalCase[],
  versions: readonly PromptVersion[],
): Promise<readonly PromptComparisonResult[]> {
  const comparisons: PromptComparisonResult[] = []
  for (const version of versions) {
    const versionedCases = cases.map((evalCase) => ({
      ...evalCase,
      input: { ...evalCase.input, system: version.system },
    }))
    const report = await runEvalSuite(versionedCases)
    comparisons.push({ version: version.name, report })
  }
  return comparisons
}
