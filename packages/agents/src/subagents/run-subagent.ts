import { runAgentLoop } from '../runtime/loop.js'
import type { RunAgentLoopInput, RunResult } from '../runtime/types.js'

/**
 * Runs a sub-agent's own loop with its own manifest, budget and kill switch
 * (all already isolated per call, since `runAgentLoop` never shares state
 * across invocations) and turns a thrown failure into data instead of an
 * exception, so a sub-agent's crash cannot pollute — or stop — its parent's
 * own run.
 */
export async function runSubagent(input: RunAgentLoopInput): Promise<RunResult> {
  try {
    return await runAgentLoop(input)
  } catch (error) {
    return {
      messages: input.messages,
      steps: [],
      finalText: null,
      stopReason: 'errored',
      usage: { inputTokens: 0, outputTokens: 0 },
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
