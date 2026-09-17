import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * L5 task 10, priority 3. Read-only by construction: no write tool is
 * declared, so nothing it finds can be "fixed" behind a human's back. Every
 * finding of `auditCompliance` is a fact about configuration or content, and
 * the report says in its own words that a checklist is not legal advice.
 */
export const complianceAgent: AgentDeclaration = defineAgent({
  name: 'compliance',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['site.config_read', 'content.collections', 'content.list', 'content.read'],
  autonomy: { default: 'observe' },
  budget: { tokensPerDay: 60_000, eurPerMonth: 4, callsPerHour: 15 },
  memory: { episodic: true, scope: 'site' },
  triggers: [{ on: 'schedule', cron: '0 4 1 * *' }],
})
