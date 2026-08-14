import { CogentaError } from '@cogenta/core'
import type { ExecutableTool, ToolExecutionContext } from '../runtime/types.js'
import type { ApprovalQueue, AutonomyConfig, AutonomyLevel } from './types.js'

export interface WithAutonomyOptions {
  readonly agentName: string
  readonly autonomy: AutonomyConfig
  readonly approvalQueue: ApprovalQueue
}

function levelFor(toolName: string, autonomy: AutonomyConfig): AutonomyLevel {
  return autonomy.overrides?.[toolName] ?? autonomy.default
}

/**
 * L4 task 9. `sideEffects: true` with `reversible` not `true` — the same
 * condition `defineTool` already requires either `revert` or forced human
 * approval for (Contract C's own rule) — always routes through the
 * approval queue, regardless of the configured level: `autonomous` cannot
 * waive it, only a human decision can. A tool with no declared
 * `sideEffects` is treated as side-effecting (the conservative default:
 * an unlabelled tool gets the gate, not a free pass).
 *
 * "`autonomous` sur un outil destructif exige une confirmation explicite à
 * l'activation, avec avertissement" is a config-time concern (validating a
 * `defineAgent` before it is saved) — out of this runtime decorator's
 * scope, which only ever sees an already-activated configuration.
 */
export function withAutonomy(tool: ExecutableTool, options: WithAutonomyOptions): ExecutableTool {
  const isSideEffecting = tool.sideEffects !== false
  const forcedApproval = isSideEffecting && tool.reversible !== true

  async function awaitApproval(
    input: Readonly<Record<string, unknown>>,
    ctx: ToolExecutionContext,
  ): Promise<unknown> {
    const decision = await options.approvalQueue.request({
      agentName: options.agentName,
      toolName: tool.spec.name,
      input,
    })
    if (decision.status !== 'approved') {
      throw new CogentaError({
        code: 'TOOL_CALL_REJECTED',
        message: `"${tool.spec.name}" was rejected by human review${decision.reason === undefined ? '.' : `: ${decision.reason}`}`,
        hint: 'Try a different approach, or ask a human to approve the request.',
      })
    }
    return tool.execute(input, ctx)
  }

  return {
    spec: tool.spec,
    ...(tool.sideEffects === undefined ? {} : { sideEffects: tool.sideEffects }),
    ...(tool.reversible === undefined ? {} : { reversible: tool.reversible }),
    async execute(input: Readonly<Record<string, unknown>>, ctx: ToolExecutionContext) {
      if (!isSideEffecting) return tool.execute(input, ctx)

      const level = levelFor(tool.spec.name, options.autonomy)

      if (!forcedApproval && level === 'observe') {
        return {
          observed: true,
          note: `Observation mode: "${tool.spec.name}" was not called.`,
        }
      }

      if (!forcedApproval && level === 'propose') {
        // Deliberately not awaited: "propose" hands the decision to a human
        // and moves on — the run does not block waiting for it, unlike
        // execute_with_approval below.
        void options.approvalQueue.request({
          agentName: options.agentName,
          toolName: tool.spec.name,
          input,
        })
        return {
          proposed: true,
          note: `Proposed "${tool.spec.name}"; awaiting human review.`,
        }
      }

      if (!forcedApproval && level === 'autonomous') {
        return tool.execute(input, ctx)
      }

      // execute_with_approval, or any level overridden by forcedApproval.
      return awaitApproval(input, ctx)
    },
  }
}

/** Applies `withAutonomy` to every tool in a manifest. */
export function withAutonomyForManifest(
  tools: readonly ExecutableTool[],
  options: WithAutonomyOptions,
): readonly ExecutableTool[] {
  return tools.map((tool) => withAutonomy(tool, options))
}
