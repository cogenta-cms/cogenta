import type { TokenUsage } from '../providers/types.js'
import type { RunAgentLoopInput, RunResult, RunStopReason } from '../runtime/types.js'

/**
 * "Jeu de cas rejoué, score comparé entre versions de prompt." A case is
 * just one `runAgentLoop` input plus how to grade its result — replaying it
 * deterministically in CI is not this module's job, it is whichever
 * `ProviderClient` the case's `input` carries (a scripted fake client for
 * CI, a real one only in an integration run, same split the provider
 * adapters already use).
 */
export interface EvalCase {
  readonly name: string
  readonly input: RunAgentLoopInput
  /** 0 (worst) to 1 (best). */
  score(result: RunResult): number | Promise<number>
}

export interface EvalCaseResult {
  readonly name: string
  readonly score: number
  readonly stopReason: RunStopReason
  readonly usage: TokenUsage
}

export interface EvalReport {
  readonly results: readonly EvalCaseResult[]
  readonly meanScore: number
}
