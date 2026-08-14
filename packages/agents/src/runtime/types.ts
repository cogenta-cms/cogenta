import type { BudgetExceededReason, BudgetTracker, KillSwitch } from '../budget/types.js'
import type {
  ChatMessage,
  ProviderClient,
  ProviderToolCall,
  ProviderToolSpec,
  TokenUsage,
} from '../providers/types.js'

export interface ToolExecutionContext {
  /** The run's cancellation signal — a tool that makes its own HTTP calls should thread this through. */
  readonly signal: AbortSignal
}

/**
 * A tool the loop can actually call. `sideEffects`/`reversible` are optional
 * because a bare `ExecutableTool` (hand-built in a test, or from a source
 * that never declared them) should not silently claim safety it did not
 * declare — `withAutonomy` (task 9) treats an unset `sideEffects` as "assume
 * side-effecting" for exactly that reason.
 */
export interface ExecutableTool {
  readonly spec: ProviderToolSpec
  readonly sideEffects?: boolean
  readonly reversible?: boolean
  execute(input: Readonly<Record<string, unknown>>, ctx: ToolExecutionContext): Promise<unknown>
}

export interface ToolCallOutcome {
  readonly call: ProviderToolCall
  readonly ok: boolean
  /** The tool's return value, serialised to a string for the model — present when `ok`. */
  readonly output?: string
  /** A human-readable failure reason, fed back to the model as the tool result — present when not `ok`. */
  readonly error?: string
}

export interface StepRecord {
  readonly response: ChatMessage
  readonly usage: TokenUsage
  readonly toolOutcomes: readonly ToolCallOutcome[]
}

export type RunStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'max_steps'
  | 'repetition_detected'
  | 'cancelled'
  | 'budget_exceeded'
  | 'max_duration'
  | 'killed'

export interface RunResult {
  readonly messages: readonly ChatMessage[]
  readonly steps: readonly StepRecord[]
  /** The last assistant turn's text — `null` if the run stopped before producing one. */
  readonly finalText: string | null
  readonly stopReason: RunStopReason
  readonly usage: TokenUsage
}

export interface RunAgentLoopInput {
  readonly client: ProviderClient
  readonly messages: readonly ChatMessage[]
  readonly system?: string
  readonly tools?: readonly ExecutableTool[]
  readonly maxTokens: number
  readonly temperature?: number
  /** Hard ceiling on model-call turns — the "infinite loop" backstop (default 25). */
  readonly maxSteps?: number
  /** Per model call, including retries (default 3). */
  readonly maxAttempts?: number
  /** Per model call attempt (default 60_000ms). */
  readonly timeoutMs?: number
  /** How many times an identical tool call (name + input) may repeat before the run stops (default 2). */
  readonly maxRepeats?: number
  readonly signal?: AbortSignal
  /** Checked before every model call; a call that would exceed it never happens ("arrêt propre et alerte, jamais dégradation silencieuse"). */
  readonly budget?: BudgetTracker
  /** Checked before every model call — an explicit, human-flipped stop, independent of budgets. */
  readonly killSwitch?: KillSwitch
  /** The alert half of a budget stop — called once, with which limit tripped, right before the run returns. */
  readonly onBudgetExceeded?: (reason: BudgetExceededReason) => void
  /** Wall-clock ceiling for the whole run — "durée maximale par run", the fourth budget dimension the lot's design section names, checked independently of `BudgetTracker` since it belongs to one run, not to the agent's calendar-bucketed totals. */
  readonly maxRunDurationMs?: number
  /** Clock the loop measures `maxRunDurationMs` against — injectable for tests, defaults to `Date.now`. */
  readonly now?: () => number
}
