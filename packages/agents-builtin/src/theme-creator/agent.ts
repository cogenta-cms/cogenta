import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Un bouton sur l'écran Apparence de l'admin qui ouvre une page pleine où
 * décrire un thème... génère un ou plusieurs thèmes prévisualisables et
 * activables... construire un agent 'Theme Creator' avec un vrai prompt
 * système détaillé pour ça." (L26 tâche 5, demandé en direct.)
 *
 * `theme.propose_theme` (`tools@1.5`) is `sideEffects: false` and has no
 * write path at any autonomy level — there is nothing this agent can do
 * other than propose, structurally, the same guarantee `designerAgent`
 * documents for its own lack of a write tool. `autonomy: propose` is set
 * anyway, for the same reason `developerAgent` pins it despite
 * `code.propose_patch` already being reversible: this is a user-facing,
 * review-worthy action (a new theme candidate an admin will look at before
 * doing anything), and `propose` is this codebase's established default
 * posture for that shape of feature, not a gate against a write this tool
 * could not perform anyway.
 *
 * Disabled by default, the same structural mechanism as every other seed in
 * this package: nothing exports a "theme-creator" entry from
 * `builtinAgentSeeds()` (`@cogenta/agents`' own `agents/builtins.ts`), and
 * `AgentDeclaration` (contract C) has no `enabled` field to begin with —
 * this catalog entry is inert until an operator wires it into their own
 * site's agent store. The admin-facing "Theme Creator" screen this lot also
 * ships calls `theme.propose_theme` directly (through `POST
 * /api/theme/generate`, widened for this lot), not through this agent
 * declaration or the runtime's agent-run endpoint — the same relationship
 * `generateSkinCandidates` already had with the site-plan screen before
 * this agent existed. This declaration exists so the tool is also reachable
 * as a real, catalog-registered agent (a scheduled trigger, a delegated
 * subagent call) rather than only as a bare function a router calls.
 */
export const themeCreatorAgent: AgentDeclaration = defineAgent({
  name: 'theme-creator',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['theme.propose_theme'],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 100_000, eurPerMonth: 6, callsPerHour: 20 },
  memory: { episodic: false, semantic: false, scope: 'site' },
})
