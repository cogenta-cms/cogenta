import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Cogenta Plugin Builder" (L31 step 4): the agent a person asks for a
 * feature this CMS does not have, which writes a real plugin for it.
 *
 * `autonomy: 'propose'` is pinned for the same reason the theme creator pins
 * it: what this agent writes is code, and code reaches a site only when a
 * human deploys the sandbox it was written in. There is deliberately no
 * deploy tool — not because the agent cannot be trusted with one, but because
 * "an agent proposes, a human applies" (R6) stops being true the moment such
 * a tool exists.
 */
export const pluginBuilderAgent: AgentDeclaration = defineAgent({
  name: 'plugin-builder',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['plugin.write_sandbox_file', 'plugin.read_sandbox_file', 'plugin.check_sandbox'],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 120_000, eurPerMonth: 8, callsPerHour: 20 },
  memory: { episodic: false, semantic: false, scope: 'site' },
})
