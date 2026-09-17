import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * L5 task 10, priority 3. Audits the HTML a visitor really receives, through
 * `auditAccessibility`, plus the theme's colour pairs through
 * `auditContrast` — the WCAG formula, not an impression. It checks the
 * subset a machine can decide alone, and its identity says so plainly rather
 * than letting a green report read as "this site is accessible".
 */
export const accessibilityAgent: AgentDeclaration = defineAgent({
  name: 'accessibility',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['http.fetch', 'content.list', 'content.read', 'media.list'],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 60_000, eurPerMonth: 4, callsPerHour: 15 },
  memory: { episodic: true, scope: 'site' },
  triggers: [{ on: 'schedule', cron: '0 4 1 * *' }],
})
