import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * L5 task 10, priority 2. `triageComments` settles what the site's own
 * anti-spam pass already settled; the agent explains the rest and leaves it
 * pending. `comments.decide` cannot delete anything — refusing a comment is
 * a status a human can reverse.
 */
export const moderationAgent: AgentDeclaration = defineAgent({
  name: 'moderation',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['comments.list', 'comments.decide', 'content.read'],
  autonomy: { default: 'observe' },
  budget: { tokensPerDay: 60_000, eurPerMonth: 4, callsPerHour: 15 },
  memory: { episodic: true, scope: 'site' },
  triggers: [{ on: 'schedule', cron: '0 * * * *' }],
})
