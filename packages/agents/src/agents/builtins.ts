import type { AgentDeclarationInput, AgentDeclarationStore, StoredAgent } from './store.js'

/**
 * L22 task 1 items 2 and 5, plus task 3 — the four agents every site starts
 * with.
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
 * The security scanner, the content-watch example and the site monitor
 * (task 3) are disabled by default, exactly as the lot asks, and all three
 * ship as editable seeds: nothing about `builtin: true` freezes their tools,
 * autonomy, budget or triggers, it only prevents deletion
 * (`AgentDeclarationStore.remove`).
 *
 * `SITE_MONITOR_AGENT_NAME` ("Site Monitor") is task 3's own agent, kept
 * separate from `SUPERAGENT_NAME` rather than folded into it: the
 * superagent's tools are whatever an operator talks to it about, one
 * instruction at a time, while this one exists to run unattended on a cron
 * trigger with a narrow, fixed toolset (read the 404 log, browse content,
 * propose or create a redirect) — a different shape of agent, not a bigger
 * one. Its default autonomy is `propose` (co-pilot), same reasoning as the
 * superagent's: a monitoring agent that can silently rewrite routing on its
 * first boot is not what "disabled by default" is supposed to soften into
 * once enabled. Raising it to `autonomous` (autopilot) is the one thing
 * task 3's spec names as the condition for an applied, not merely
 * suggested, redirect.
 */
export const SUPERAGENT_NAME = 'Cogenta Agent'
export const SECURITY_AGENT_NAME = 'Security Scanner'
export const CONTENT_WATCH_AGENT_NAME = 'Content Watch'
export const SITE_MONITOR_AGENT_NAME = 'Site Monitor'

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
        // The browse pair (L22 task 3) — without them the superagent could
        // only read an entry whose id it already knew, and a live run
        // against DeepSeek showed it guessing ids 1..10 to count a site's
        // posts. Same permission as `content.read`, read-only.
        'content.collections',
        'content.list',
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
    {
      name: SITE_MONITOR_AGENT_NAME,
      identity: {
        role: 'Watches this site’s own 404 log for a broken link worth fixing, and either proposes or creates a redirect to a page it picks — never anything else (it never touches content, media or site config).',
        objectives: [
          'Call logs.read_not_found and look at the paths with the most hits.',
          'For the top one with no redirect yet, call content.collections then content.list to find a genuinely related, routed page.',
          'Call redirects.create with that path as "to" — under co-pilot autonomy this only ever proposes the change for an admin to confirm in the Redirections screen; nothing is written until it does.',
          'Skip a 404 with too few hits to be worth a redirect, or when nothing in the site’s content is actually related — proposing a bad redirect is worse than proposing none.',
        ],
        style: 'Terse, factual, one finding per turn.',
      },
      model: DEFAULT_MODEL,
      tools: ['logs.read_not_found', 'content.collections', 'content.list', 'redirects.create'],
      autonomy: { default: 'propose' },
      budget: { tokensPerDay: 50_000, callsPerHour: 10 },
      triggers: [{ on: 'schedule', cron: '0 7 * * *' }],
      enabled: false,
    },
  ]
}

/**
 * Idempotent: called both by `create-cogenta` at install and defensively by
 * `cogenta serve` at every boot (an upgrade from an older site gains
 * whichever of these it does not already have the first time it starts on
 * the new version, not only a freshly scaffolded one). Matched by name — a
 * seed already present (its `builtin: true` record cannot be removed, only
 * disabled or edited) is left untouched, never overwritten with the seed's
 * defaults again.
 */
export async function ensureBuiltinAgents(store: AgentDeclarationStore): Promise<void> {
  for (const seed of builtinAgentSeeds()) {
    const existing = await store.get(seed.name)
    if (existing === undefined) await store.create(seed, true)
    else await grantContentBrowse(store, existing)
  }
}

/**
 * The one exception to "never touch an existing seed": `content.collections`
 * and `content.list` are the read-only half of `content.read` (same
 * permission, added after the superagent first shipped), so a built-in that
 * already holds `content.read` gains nothing it could not already do — it
 * only stops having to guess entry ids. An operator who removed
 * `content.read` on purpose is left alone.
 */
const CONTENT_BROWSE_TOOLS = ['content.collections', 'content.list'] as const

async function grantContentBrowse(
  store: AgentDeclarationStore,
  existing: StoredAgent,
): Promise<void> {
  if (!existing.tools.includes('content.read')) return
  const missing = CONTENT_BROWSE_TOOLS.filter((tool) => !existing.tools.includes(tool))
  if (missing.length === 0) return
  await store.update(existing.name, { tools: [...existing.tools, ...missing] })
}
