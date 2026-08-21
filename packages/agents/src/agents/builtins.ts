import type { AgentDeclarationInput, AgentDeclarationStore } from './store.js'

/**
 * L22 task 1 items 2 and 5 — the three agents every site starts with.
 *
 * `SUPERAGENT_NAME` ("Cogenta Agent") is active by default, with every
 * content/media/site/document tool this build actually implements (never a
 * placeholder permission with no tool behind it — `deps.scan` is the one
 * this lot adds for exactly this agent). Its autonomy defaults to `propose`
 * (the UI's "co-pilot") rather than `autonomous`: "actif par défaut" is
 * about the agent *existing and being enabled*, not about every write it
 * might make happening unattended from the first boot — a judgment call,
 * flagged in this lot's report, that a site operator can raise to
 * `autonomous` per tool or by default once they trust it.
 *
 * The security scanner and the content-watch example are disabled by
 * default, exactly as the lot asks, and both ship as editable seeds: nothing
 * about `builtin: true` freezes their tools, autonomy, budget or triggers,
 * it only prevents deletion (`AgentDeclarationStore.remove`).
 */
export const SUPERAGENT_NAME = 'Cogenta Agent'
export const SECURITY_AGENT_NAME = 'Security Scanner'
export const CONTENT_WATCH_AGENT_NAME = 'Content Watch'

/** Passed to `AgentDeclarationInput.model` — every seed prefers the same provider/model names an operator is most likely to configure first; `agents/orchestrator.ts` never fails to resolve a provider just because the *name* differs from what the site has enabled, it only needs `providers/store.ts` to have configured at least one. */
const DEFAULT_MODEL = { preferred: 'anthropic', fallback: 'openai' } as const

export function builtinAgentSeeds(): readonly AgentDeclarationInput[] {
  return [
    {
      name: SUPERAGENT_NAME,
      identity: {
        role: 'The default, general-purpose agent for this Cogenta site — reads and writes content, media and configuration on behalf of the operator who talks to it, within whatever an admin actor may do.',
        objectives: [
          'Carry out the instruction it is given, using the smallest set of tool calls that does it.',
          'Prefer reading before writing, and ask for a specific, named sub-agent when a task is squarely that sub-agent’s specialty.',
          'Never claim an action succeeded without the tool result to show for it.',
        ],
        style: 'Direct, concrete, and honest about what it did and did not do.',
      },
      model: DEFAULT_MODEL,
      tools: [
        'content.read',
        'content.write_draft',
        'content.publish',
        'content.delete',
        'media.read',
        'media.write',
        'site.config_read',
        'document.extract_text',
      ],
      autonomy: { default: 'propose' },
      budget: { tokensPerDay: 200_000, callsPerHour: 60 },
      memory: { episodic: true, scope: 'site' },
      enabled: true,
    },
    {
      name: SECURITY_AGENT_NAME,
      identity: {
        role: 'Scans this site’s own declared dependencies for risky version pins on a schedule, and reports what it finds — it never patches anything itself.',
        objectives: [
          'Run deps.scan and summarise anything it flags (an unpinned or wildcard version).',
          'Report findings; never call a write tool.',
        ],
        style: 'Terse, factual, one line per finding.',
      },
      model: DEFAULT_MODEL,
      tools: ['deps.scan', 'content.read'],
      autonomy: { default: 'observe' },
      budget: { tokensPerDay: 50_000, callsPerHour: 10 },
      triggers: [{ on: 'schedule', cron: '0 6 * * *' }],
      enabled: false,
    },
    {
      name: CONTENT_WATCH_AGENT_NAME,
      identity: {
        role: 'An example agent: wakes up periodically, looks over recently published content, and proposes new draft titles worth writing about — a starting point meant to be edited, not a fixed feature.',
        objectives: [
          'Read recent published entries in the configured collection.',
          'Propose 1-3 new draft entries (title + a one-line outline) via content.write_draft — never publish them.',
        ],
        style: 'Editorial, brief, no filler.',
      },
      model: DEFAULT_MODEL,
      tools: ['content.read', 'content.write_draft'],
      autonomy: { default: 'propose' },
      budget: { tokensPerDay: 50_000, callsPerHour: 10 },
      triggers: [{ on: 'schedule', cron: '0 8 * * 1' }],
      enabled: false,
    },
  ]
}

/**
 * Idempotent: called both by `create-cogenta` at install and defensively by
 * `cogenta serve` at every boot (an upgrade from a pre-L22 site gets the
 * three builtins the first time it starts on the new version, not only a
 * freshly scaffolded one). Matched by name — a seed already present (its
 * `builtin: true` record cannot be removed, only disabled or edited) is
 * left untouched, never overwritten with the seed's defaults again.
 */
export async function ensureBuiltinAgents(store: AgentDeclarationStore): Promise<void> {
  for (const seed of builtinAgentSeeds()) {
    const existing = await store.get(seed.name)
    if (existing === undefined) await store.create(seed, true)
  }
}
