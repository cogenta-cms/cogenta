import { CogentaError } from '@cogenta/core'
import type { AgentToolsDeclaration } from './types.js'

/**
 * `subagent.tools ⊆ parent.tools`, checked once for the whole declared set —
 * at load time, never at call time (the lot's own wording: an invalid
 * declaration must stop the agent from loading at all, not fail mid-run).
 */
export function validateSubagentTools(agents: readonly AgentToolsDeclaration[]): void {
  const byName = new Map(agents.map((agent) => [agent.name, agent]))

  for (const agent of agents) {
    for (const subagentName of agent.subagents ?? []) {
      const subagent = byName.get(subagentName)
      if (subagent === undefined) {
        throw new CogentaError({
          code: 'AGENT_SUBAGENT_UNKNOWN',
          message: `"${agent.name}" declares sub-agent "${subagentName}", which is not in this agent set.`,
          hint: 'Declare the sub-agent alongside its parent before validating, or remove it from `subagents`.',
        })
      }

      const parentTools = new Set(agent.tools)
      const excess = subagent.tools.filter((tool) => !parentTools.has(tool))
      if (excess.length > 0) {
        throw new CogentaError({
          code: 'AGENT_SUBAGENT_TOOLS_NOT_SUBSET',
          message: `Sub-agent "${subagentName}" has tools not granted to its parent "${agent.name}": ${excess.join(', ')}.`,
          hint: 'A sub-agent can never see more than its parent — grant the tool to the parent too, or remove it from the sub-agent.',
          details: { parent: agent.name, subagent: subagentName, excess },
        })
      }
    }
  }
}
