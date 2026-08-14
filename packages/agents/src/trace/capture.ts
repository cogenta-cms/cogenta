import { newId } from '@cogenta/core'
import type { RunResult } from '../runtime/types.js'
import type { Trace, TraceStore } from './types.js'

export interface CaptureTraceOptions {
  readonly agentName: string
  readonly store: TraceStore
  /** Fraction of runs actually persisted, `0..1` (default `1` — capture everything). The sampling half of "rétention et échantillonnage configurables dès le départ". */
  readonly sampleRate?: number
  readonly random?: () => number
  readonly now?: () => number
  readonly newId?: () => string
}

/**
 * Wraps a call to `runAgentLoop` (or anything returning a `RunResult`) and,
 * unless sampling skips it, persists the run as a `Trace`. The run's own
 * result is always returned unchanged — capture is an observer, never a
 * condition for the run succeeding or failing.
 */
export async function captureTrace(
  run: () => Promise<RunResult>,
  options: CaptureTraceOptions,
): Promise<RunResult> {
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const sampleRate = options.sampleRate ?? 1
  const generateId = options.newId ?? newId

  const startedAt = now()
  const result = await run()
  const finishedAt = now()

  if (random() < sampleRate) {
    const trace: Trace = {
      id: generateId(),
      agentName: options.agentName,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      stopReason: result.stopReason,
      usage: result.usage,
      steps: result.steps,
      messages: result.messages,
    }
    await options.store.save(trace)
  }

  return result
}
