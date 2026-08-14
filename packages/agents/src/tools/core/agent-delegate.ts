import { z } from 'zod'
import type { ProviderClient } from '../../providers/types.js'
import type { ExecutableTool } from '../../runtime/types.js'
import { runSubagent } from '../../subagents/run-subagent.js'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

export interface AgentDelegateToolOptions {
  /** For messages only — which sub-agent this instance delegates to. */
  readonly subagentName: string
  readonly client: ProviderClient
  /** The sub-agent's own manifest — built (elsewhere) from its own `tools`, already checked to be a subset of the parent's via `validateSubagentTools`. */
  readonly tools: readonly ExecutableTool[]
  readonly system?: string
  readonly maxTokens: number
  readonly maxSteps?: number
}

const AgentDelegateInputSchema = z.object({ task: z.string() })
export type AgentDelegateInput = z.infer<typeof AgentDelegateInputSchema>

const AgentDelegateOutputSchema = z.object({
  finalText: z.string().nullable(),
  stopReason: z.string(),
})
export type AgentDelegateOutput = z.infer<typeof AgentDelegateOutputSchema>

/**
 * `agent.delegate` — hands one task to a sub-agent's own `runAgentLoop` run,
 * with its own manifest and budget (both fixed at construction, one instance
 * per delegating agent, same pattern as `http.fetch`'s per-agent domain
 * list). `runSubagent` (task 11) is what keeps a sub-agent's crash from
 * propagating: this tool's `execute` never throws for that reason, only for
 * an input/output schema mismatch, which is the manifest's job to catch.
 */
export function createAgentDelegateTool(
  options: AgentDelegateToolOptions,
): ToolDefinition<AgentDelegateInput, AgentDelegateOutput> {
  return defineTool({
    name: 'agent.delegate',
    version: '1.0.0',
    description: `Delegate one task to the "${options.subagentName}" sub-agent.`,
    input: AgentDelegateInputSchema,
    output: AgentDelegateOutputSchema,
    permissions: ['agent.delegate'],
    sideEffects: false,
    reversible: false,
    cost: 'high',
    async execute(input) {
      const result = await runSubagent({
        client: options.client,
        messages: [{ role: 'user', content: input.task }],
        tools: options.tools,
        maxTokens: options.maxTokens,
        ...(options.system === undefined ? {} : { system: options.system }),
        ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
      })

      return { finalText: result.finalText, stopReason: result.stopReason }
    },
  })
}
