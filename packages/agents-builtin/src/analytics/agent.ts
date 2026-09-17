import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * L5 task 10, priority 3. Reads figures and writes nothing at all — there is
 * no write tool in this list. Every number in its report comes from
 * `readAudienceSignals`, which applies both a relative threshold and an
 * absolute floor so a page going from two views to five is never a story.
 */
export const analyticsAgent: AgentDeclaration = defineAgent({
  name: 'analytics',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['analytics.summary', 'content.list', 'content.read', 'logs.read_not_found'],
  autonomy: { default: 'observe' },
  budget: { tokensPerDay: 60_000, eurPerMonth: 4, callsPerHour: 15 },
  memory: { episodic: true, scope: 'site' },
  triggers: [{ on: 'schedule', cron: '0 6 * * 1' }],
})
