import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * L5 task 10, priority 2. Its findings come from `auditMediaLibrary`, never
 * from the model: the model writes alt text for the images the audit named,
 * and nothing else. No delete anywhere in `tools` — "no longer referenced"
 * is not "no longer wanted", and a file removal is not reversible by the
 * content trash.
 */
export const mediaAgent: AgentDeclaration = defineAgent({
  name: 'media',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: [
    'media.list',
    'media.read',
    'media.write',
    'content.collections',
    'content.list',
    'content.read',
  ],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 60_000, eurPerMonth: 4, callsPerHour: 15 },
  memory: { episodic: true, scope: 'site' },
  triggers: [{ on: 'schedule', cron: '0 5 * * 1' }],
})
