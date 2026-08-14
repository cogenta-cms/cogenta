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
 * A tool the loop can actually call. Permission checking, the full manifest,
 * and `revert` all belong to later tasks (4, 10) — this is deliberately just
 * enough surface for the loop to dispatch a call and get a result back.
 */
export interface ExecutableTool {
  readonly spec: ProviderToolSpec
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
}
