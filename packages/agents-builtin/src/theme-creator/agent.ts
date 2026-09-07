import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Un bouton sur l'écran Apparence de l'admin qui ouvre une page pleine où
 * décrire un thème... génère un ou plusieurs thèmes prévisualisables et
 * activables... construire un agent 'Theme Creator' avec un vrai prompt
 * système détaillé pour ça." (L26 tâche 5, demandé en direct.)
 *
 * `theme.propose_theme` (`tools@1.5`) is `sideEffects: false` and has no
 * write path at any autonomy level — the same guarantee `designerAgent`
 * documents for its own lack of a write tool.
 *
 * `theme.write_sandbox_file` (`tools@1.6`, fiche 73 task 7) is different:
 * `sideEffects: true`, `reversible: true`, and it does write — but only ever
 * into one sandbox directory (`.cogenta/theme-sandbox/<id>/`), never into
 * `themes/`, never anything a live request could resolve. `autonomy:
 * propose` still governs both tools identically: for `theme.propose_theme`
 * it is this codebase's established default posture for a review-worthy
 * feature, not a gate against a write the tool could not perform anyway; for
 * `theme.write_sandbox_file` it is a real, load-bearing gate — `withAutonomy`
 * (R4) requires human approval for every sandbox write at this pinned level,
 * exactly as it would for any other `sideEffects: true` tool.
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
  tools: ['theme.propose_theme', 'theme.write_sandbox_file'],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 100_000, eurPerMonth: 6, callsPerHour: 20 },
  memory: { episodic: false, semantic: false, scope: 'site' },
})
