import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Point clé : il mesure le site déployé, pas un environnement local." No
 * `content.write_draft` or `content.publish` in `tools` — this agent reports
 * and proposes through `channel.send`/`build.trigger`, it never writes
 * content itself.
 */
export const performanceAgent: AgentDeclaration = defineAgent({
  name: 'performance',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['http.fetch', 'content.read', 'channel.send', 'build.trigger'],
  skills: ['performance-diagnosis'],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 100_000, eurPerMonth: 6, callsPerHour: 20 },
  memory: { episodic: true, semantic: true, scope: 'site' },
  triggers: [{ on: 'deploy.completed' }, { on: 'schedule', cron: '0 6 * * *' }],
})
