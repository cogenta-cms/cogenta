import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * L5 task 10, priority 3. Works only on entries an import wrote
 * (`provenance: 'imported'`) — `findMigrationResidue` filters on that — and
 * never touches a slug: changing an imported URL breaks exactly the links the
 * migration set out to keep. A redirect it creates is reversible and audited,
 * like the Site Monitor's (L22 task 3).
 */
export const migrationAgent: AgentDeclaration = defineAgent({
  name: 'migration',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: [
    'content.collections',
    'content.schema',
    'content.list',
    'content.read',
    'content.write_draft',
    'redirects.create',
  ],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 60_000, eurPerMonth: 4, callsPerHour: 15 },
  memory: { episodic: true, scope: 'site' },
  triggers: [{ on: 'schedule', cron: '0 5 1 * *' }],
})
