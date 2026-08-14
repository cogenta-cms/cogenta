import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Autonomie par défaut : `deps.scan` autonome, `deps.patch` en
 * proposition." `deps.scan` is read-only (task 3) so autonomous execution
 * never touches anything; `deps.patch` opens a PR (task 4) and stays at the
 * agent's `default` level (`propose`) by never being named in `overrides`.
 * "Le mode autonome sur `deps.patch` est désactivé à l'installation et
 * exige une confirmation avec avertissement" is a deployment-time
 * configuration control, not something this declaration can enforce at
 * runtime (same scoping the autonomy decorator itself documents, L4 task 9)
 * — the safeguard here is simply that nothing in this file grants it.
 */
export const securityAgent: AgentDeclaration = defineAgent({
  name: 'security',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: [
    'deps.scan',
    'deps.patch',
    'content.read',
    'site.config_read',
    'http.fetch',
    'channel.send',
    'build.trigger',
  ],
  skills: ['cve-triage', 'security-report'],
  autonomy: { default: 'propose', overrides: { 'deps.scan': 'autonomous' } },
  budget: { tokensPerDay: 200_000, eurPerMonth: 10, callsPerHour: 30 },
  memory: { episodic: true, semantic: true, procedural: true, scope: 'site' },
  triggers: [
    { on: 'cve.published' },
    { on: 'schedule', cron: '0 6 * * *' },
    { on: 'dependency.installed' },
  ],
})
