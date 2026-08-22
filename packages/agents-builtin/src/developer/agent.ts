import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Câblé désactivé par défaut, comme les deux agents intégrés de L22
 * (Security Scanner, Content Watch)." `@cogenta/agents-builtin` has no
 * `enabled` flag to set — `AgentDeclaration` (Contract C's own shape,
 * `packages/agents/src/agents/types.ts`) never carried one, and none of
 * `contentAgent`/`performanceAgent`/`securityAgent`/`seoAgent` in this
 * package are wired into any site's live `AgentDeclarationStore` either
 * (confirmed by search: nothing outside this package and its own tests
 * imports them — `create-cogenta`'s blueprints only cite them as prose
 * recommendations, e.g. `BLOG_RECOMMENDED_AGENTS`). This package is a
 * catalogue an operator opts into, never a registry that runs anything on
 * its own — every agent declared here is already "disabled by default" in
 * the only sense that applies to a catalogue entry: nothing activates it
 * without a human registering it on a real site. `developerAgent` follows
 * the same shape for the same reason, not a special case.
 *
 * The four *live*, store-seeded agents ("Cogenta Agent", "Security
 * Scanner", "Content Watch", "Site Monitor" — `packages/agents/src/agents/
 * builtins.ts`, `ensureBuiltinAgents`) are a different mechanism entirely:
 * inline identities, an `enabled: boolean` the store actually persists,
 * auto-seeded at every `cogenta serve` boot. Wiring `developerAgent` into
 * that store as a fifth seed is explicitly out of scope for this task — the
 * mission that produced this file asked for the `agents-builtin` shape
 * (`security/agent.ts`'s `agent.ts` + `identity.md` pattern), and mixing
 * the two mechanisms in one change would blur which one this agent
 * actually belongs to. A future lot can promote it into `builtins.ts` if a
 * site should ship with it pre-seeded (disabled) rather than catalogue-only.
 */
export const developerAgent: AgentDeclaration = defineAgent({
  name: 'developer',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['schema.read', 'site.config_read', 'code.propose_patch'],
  skills: ['cogenta-architecture', 'contract-review'],
  // No override, ever, for `code.propose_patch` — a code change always
  // waits for a human, exactly the reasoning `securityAgent`'s comment
  // gives for `deps.patch` staying at the agent's `default`. Unlike
  // `securityAgent` (whose `deps.scan` is read-only and safe to run
  // unattended), nothing this agent can call is read-write-safe to
  // automate: `schema.read`/`site.config_read` are read-only tools with no
  // side effect to gate in the first place, so there is no second
  // permission here that could plausibly earn `autonomous` either.
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 300_000, eurPerMonth: 15, callsPerHour: 20 },
  memory: { episodic: true, semantic: true, scope: 'site' },
})
