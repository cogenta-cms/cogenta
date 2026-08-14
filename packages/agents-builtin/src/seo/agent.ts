import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Règle : il propose des brouillons, il ne publie jamais." No `content.publish`
 * anywhere in `tools` — the runtime cannot grant what was never listed
 * (L4 task 4's own enforcement point), so this is structural, not a
 * convention the agent merely follows.
 */
export const seoAgent: AgentDeclaration = defineAgent({
  name: 'seo',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['content.read', 'content.write_draft', 'http.fetch', 'channel.send'],
  skills: ['seo-audit', 'aeo-geo'],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 150_000, eurPerMonth: 8, callsPerHour: 30 },
  memory: { episodic: true, semantic: true, scope: 'site' },
  triggers: [
    { on: 'content.before_publish' },
    { on: 'schedule', cron: '0 6 * * 1' },
    { on: 'content.structure_changed' },
  ],
})
