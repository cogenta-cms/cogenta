import type { ChatMessage, TokenUsage } from '../providers/types.js'
import type { RunStopReason, StepRecord } from '../runtime/types.js'

/**
 * L4 task 7: a full record of one agent run, enough to inspect what
 * happened and, later, to replay it (task 20's evaluation harness). Nothing
 * here is new data — `runAgentLoop`'s own `RunResult` already carries every
 * step, message, and usage figure; a trace is that result, timestamped and
 * given an id worth storing.
 */
export interface Trace {
  readonly id: string
  readonly agentName: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly stopReason: RunStopReason
  readonly usage: TokenUsage
  readonly steps: readonly StepRecord[]
  readonly messages: readonly ChatMessage[]
}

export interface TraceQuery {
  readonly agentName?: string
  /** Most recent first; caps how many `list` returns (default implementation-defined, but never unbounded). */
  readonly limit?: number
}

export interface TraceStore {
  save(trace: Trace): Promise<void>
  get(id: string): Promise<Trace | null>
  list(query?: TraceQuery): Promise<readonly Trace[]>
  /**
   * The retention half of "rétention et échantillonnage configurables dès
   * le départ" (L4's own pitfalls list, on trace volume) — removes every
   * trace whose `startedAt` is older than `olderThanMs` ago, returns how
   * many were removed.
   */
  prune(olderThanMs: number, now?: () => number): Promise<number>
}
