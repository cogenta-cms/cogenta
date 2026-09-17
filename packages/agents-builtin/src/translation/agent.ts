import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * L5 task 10, priority 2. `findTranslationGaps` decides what is missing or
 * behind; the model only translates what it was handed, into a draft. No
 * `content.publish`: which language a site speaks in public is an editorial
 * decision, and ADR-0014 makes each translation a real entry someone owns.
 */
export const translationAgent: AgentDeclaration = defineAgent({
  name: 'translation',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: [
    'content.collections',
    'content.schema',
    'content.list',
    'content.read',
    'content.write_draft',
  ],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 60_000, eurPerMonth: 4, callsPerHour: 15 },
  memory: { episodic: true, scope: 'site' },
  triggers: [{ on: 'schedule', cron: '0 5 * * 2' }],
})
