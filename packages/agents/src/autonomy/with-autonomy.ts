import { CogentaError, createLogger, isCogentaError, type Logger } from '@cogenta/core'
import type { ExecutableTool, ToolExecutionContext } from '../runtime/types.js'
import type { ApprovalQueue, AutonomyConfig, AutonomyLevel } from './types.js'

export interface WithAutonomyOptions {
  readonly agentName: string
  readonly autonomy: AutonomyConfig
  readonly approvalQueue: ApprovalQueue
  /** Reports asynchronous proposal storage failures; never includes the action input. */
  readonly logger?: Pick<Logger, 'error'>
}

function levelFor(toolName: string, autonomy: AutonomyConfig): AutonomyLevel {
  return autonomy.overrides?.[toolName] ?? autonomy.default
}

/** Least to most freedom. */
const LEVEL_ORDER: readonly AutonomyLevel[] = [
  'observe',
  'propose',
  'execute_with_approval',
  'autonomous',
]

function stricter(a: AutonomyLevel, b: AutonomyLevel): AutonomyLevel {
  return LEVEL_ORDER.indexOf(a) <= LEVEL_ORDER.indexOf(b) ? a : b
}

/**
 * The autonomy a delegated run gets: for every tool, the stricter of what
 * the delegating agent and the delegate are each allowed. A sub-agent ran
 * on its own settings, so an agent limited to proposing could reach an
 * autopilot one and have it act — content an author wrote, read by the
 * first, was enough to trigger it (security review of 2026-10-21).
 */
export function stricterAutonomy(parent: AutonomyConfig, child: AutonomyConfig): AutonomyConfig {
  const overrides: Record<string, AutonomyLevel> = {}
  for (const name of new Set([
    ...Object.keys(parent.overrides ?? {}),
    ...Object.keys(child.overrides ?? {}),
  ])) {
    overrides[name] = stricter(levelFor(name, parent), levelFor(name, child))
  }
  return { default: stricter(parent.default, child.default), overrides }
}

function assertActive(ctx: ToolExecutionContext): void {
  if (ctx.signal.aborted)
    throw new CogentaError({
      code: 'APPROVAL_REQUEST_CANCELLED',
      message: 'The agent run was cancelled before this action could execute.',
      hint: 'Start a new run; a later approval cannot resume a cancelled action.',
    })
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
  const logger = options.logger ?? createLogger({ level: 'error' })
  const isSideEffecting = tool.sideEffects !== false
  const forcedApproval = isSideEffecting && tool.reversible !== true

  async function awaitApproval(
    input: Readonly<Record<string, unknown>>,
    ctx: ToolExecutionContext,
  ): Promise<unknown> {
    const decision = await options.approvalQueue.request(
      {
        agentName: options.agentName,
        toolName: tool.spec.name,
        input,
      },
      ctx.signal,
    )
    assertActive(ctx)
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
      assertActive(ctx)
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
        void options.approvalQueue
          .request(
            {
              agentName: options.agentName,
              toolName: tool.spec.name,
              input,
            },
            ctx.signal,
          )
          .catch((error: unknown) => {
            // Proposals never execute the action. Ending their run/process can
            // stop the waiter while keeping its durable record for human review.
            if (isCogentaError(error) && error.code === 'APPROVAL_REQUEST_CANCELLED') return
            logger.error('Agent proposal could not be recorded for human review', {
              agent: options.agentName,
              tool: tool.spec.name,
              code: isCogentaError(error) ? error.code : 'INTERNAL',
            })
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
