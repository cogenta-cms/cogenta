import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Doit pouvoir proposer une modification de code réelle (diff), jamais
 * l'appliquer sans validation humaine explicite au niveau `autopilot` le
 * plus élevé accordé par l'admin — même politique que les autres agents
 * intégrés." (`docs/lots/L24-langgraph-agents-avances.md`, tâche 3, which
 * points at task 2's own wording for what "same policy" means.)
 *
 * There is, as of this lot, no contract C tool that writes a theme file, a
 * skin token sheet or a block layout anywhere in `packages/agents/src/tools`
 * — `generateSkin`/`generateSkinCandidates` (`packages/agents/src/skin/`,
 * `packages/agents/src/site-plan/skin-candidates.ts`) are library functions
 * the installer and the admin site-plan router call directly, never
 * something exposed through `withAutonomy`/a `ToolRegistry` entry a running
 * agent can invoke. So "jamais l'appliquer sans validation humaine" is not
 * merely this declaration's intent, it is structural in the same sense
 * `contentAgent`/`seoAgent` document for `content.publish`: the runtime
 * cannot grant a write path that was never built. `channel.send` is this
 * agent's only way to hand a human a proposal (a described change, a token
 * table, a rendered comparison) — never a file write.
 *
 * `build.trigger` is granted for the one legitimate read-adjacent use a
 * design proposal has for it: asking CI to typecheck/test a *branch* a human
 * has already pushed from this agent's suggestion, the same non-destructive
 * use `performanceAgent` documents for its own budget-regression reports. It
 * does not let this agent publish anything — `deploy.trigger` is
 * deliberately absent.
 *
 * Disabled by default, the same structural mechanism as every other seed in
 * this package (`securityAgent`, `contentAgent`, `seoAgent`,
 * `performanceAgent`): nothing exports a "designer" entry from
 * `builtinAgentSeeds()` (`@cogenta/agents`' own `agents/builtins.ts`, the
 * file that actually seeds a live per-site `AgentDeclarationStore` with
 * `enabled: true|false`), and `defineAgent`'s own `AgentDeclaration` type
 * (contract C) has no `enabled` field to begin with — this catalog entry is
 * inert until an operator wires it into their own site's agent store, the
 * same way `docs/lots/L9-ecosysteme.md`'s blueprint recommendations
 * (`STORE_RECOMMENDED_AGENTS`) already point at `seoAgent`/`performanceAgent`
 * from this very package without ever activating them automatically.
 */
export const designerAgent: AgentDeclaration = defineAgent({
  name: 'designer',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: [
    'content.read',
    'media.read',
    'site.config_read',
    'http.fetch',
    'channel.send',
    'build.trigger',
  ],
  skills: ['design-system-audit', 'accessible-color-tokens'],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 150_000, eurPerMonth: 8, callsPerHour: 20 },
  memory: { episodic: true, semantic: true, scope: 'site' },
  triggers: [{ on: 'schedule', cron: '0 5 * * 1' }, { on: 'content.structure_changed' }],
})
