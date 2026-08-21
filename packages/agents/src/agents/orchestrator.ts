import { CogentaError } from '@cogenta/core'
import type { AuditLogLike } from '../audit/types.js'
import { withAuditForManifest } from '../audit/with-audit.js'
import type { ApprovalQueue } from '../autonomy/types.js'
import { withAutonomyForManifest } from '../autonomy/with-autonomy.js'
import { createBudgetTracker } from '../budget/tracker.js'
import type { BudgetTracker, KillSwitch } from '../budget/types.js'
import { assembleContext, type SiteContext } from '../identity/context.js'
import type { ProviderClient } from '../providers/types.js'
import { runAgentLoop } from '../runtime/loop.js'
import type { ExecutableTool, RunResult, RunStopReason } from '../runtime/types.js'
import type { AgentSkillStore } from '../skills/library.js'
import { createAgentDelegateTool } from '../tools/core/agent-delegate.js'
import { buildManifest } from '../tools/manifest.js'
import { createToolRegistry, type ToolRegistry } from '../tools/registry.js'
import type { ToolContext } from '../tools/types.js'
import type { AgentDeclarationStore, StoredAgent } from './store.js'

/**
 * Two different "site" shapes meet here on purpose, not by accident:
 * `ToolContext.site` (what `buildManifest` needs — `defaultLocale`
 * required, no `brand`/`tone`/`constraints`) and `identity/context.js`'s
 * `SiteContext` (what `assembleContext` needs — the reverse). `RunnerSite`
 * is the superset a caller supplies once; `siteContextOf`/`toolSiteOf` below
 * project it down to whichever shape a given call actually needs.
 */
export interface RunnerSite {
  readonly name: string
  readonly url?: string
  readonly locales: readonly string[]
  readonly defaultLocale: string
  readonly brand?: string
  readonly tone?: string
  readonly constraints?: readonly string[]
}

/**
 * L22 task 1's actual deliverable: the wiring `AgentRegistry` never had.
 * Everything this function calls already existed and was already tested
 * (`runAgentLoop`, `buildManifest`, `withAutonomyForManifest`,
 * `withAuditForManifest`, `createAgentDelegateTool`, `assembleContext`,
 * `createBudgetTracker`) — this module's own job is only to put them
 * together in the right order for one named agent, never to reimplement any
 * of them.
 *
 * Order of wrapping matters: `withAudit` is the outermost layer, so the
 * audit trail records what actually happened (executed, observed, or
 * proposed-and-not-yet-decided) rather than the raw tool's own behaviour —
 * `withAutonomy` sits directly on the raw tool underneath it.
 */

export interface AgentProviderRegistryLike {
  has(name: string): boolean
  get(name: string): ProviderClient
}

export interface RunAgentOptions {
  /** Runtime-generated instruction (a trigger, an operator's typed request) — never external content (R8's own distinction, see `identity/context.ts`). */
  readonly instruction: string
  /** What started this run — recorded in the run-level audit entry. */
  readonly trigger?: string
  readonly signal?: AbortSignal
  readonly maxTokens?: number
}

export interface AgentRunSummary {
  readonly agent: string
  readonly stopReason: RunStopReason
  readonly finalText: string | null
  readonly steps: number
  readonly usage: RunResult['usage']
}

export interface AgentRunnerOptions {
  readonly agents: AgentDeclarationStore
  readonly skills: AgentSkillStore
  /** The site's full contract-C tool registry — content/media/site-config/http-fetch/document-extract/deps-scan, whatever this build/deployment actually implements. `buildManifest` refuses (at call time) any name an agent declares that is not in here. */
  readonly tools: ToolRegistry
  readonly providers: AgentProviderRegistryLike
  readonly auditLog: AuditLogLike
  readonly approvalQueue: ApprovalQueue
  readonly site: RunnerSite
  readonly killSwitchFor: (name: string) => KillSwitch
  readonly now?: () => number
  readonly defaultMaxTokens?: number
  /** Injectable for tests — defaults to a real `Date.now`-bucketed tracker per agent, cached for the runner's lifetime. */
  readonly budgetTrackerFor?: (agent: StoredAgent) => BudgetTracker
}

export interface AgentRunner {
  run(name: string, options: RunAgentOptions): Promise<AgentRunSummary>
}

const DEFAULT_MAX_TOKENS = 2000
/** One hop only — a sub-agent's own `subagents` are not wired recursively (see the module comment on why this is a deliberate, bounded choice, not an oversight). */
const SUBAGENT_MAX_TOKENS = 1500

function toolSiteOf(site: RunnerSite): ToolContext['site'] {
  return {
    name: site.name,
    ...(site.url === undefined ? {} : { url: site.url }),
    locales: site.locales,
    defaultLocale: site.defaultLocale,
  }
}

function siteContextOf(site: RunnerSite): SiteContext {
  return {
    name: site.name,
    ...(site.brand === undefined ? {} : { brand: site.brand }),
    ...(site.tone === undefined ? {} : { tone: site.tone }),
    locales: site.locales,
    ...(site.constraints === undefined ? {} : { constraints: site.constraints }),
  }
}

function agentUnknown(name: string): CogentaError {
  return new CogentaError({
    code: 'AGENT_UNKNOWN',
    message: `No agent named "${name}" is registered.`,
    hint: 'Check the name against the Agents screen, or create it first.',
  })
}

function agentDisabled(name: string): CogentaError {
  return new CogentaError({
    code: 'AGENT_DISABLED',
    message: `"${name}" is disabled and cannot run.`,
    hint: 'Enable it from the Agents screen first.',
  })
}

/**
 * R2, applied at the one place a network call would otherwise happen:
 * resolving a `ProviderClient` is a synchronous registry lookup (`get`
 * throws `PROVIDER_UNKNOWN` without ever touching the network — see
 * `providers/registry.ts`), so trying `preferred` then `fallback` and
 * throwing `AGENT_NO_PROVIDER` when neither resolves guarantees zero
 * outbound requests for a site with no provider configured — the same
 * guarantee `packages/cli/test/serve-assistant.test.ts` already proves for
 * `assist.*`, extended here to the agent runtime.
 */
function resolveProvider(
  agentName: string,
  model: { readonly preferred: string; readonly fallback?: string },
  providers: AgentProviderRegistryLike,
): ProviderClient {
  if (providers.has(model.preferred)) return providers.get(model.preferred)
  if (model.fallback !== undefined && providers.has(model.fallback)) {
    return providers.get(model.fallback)
  }
  throw new CogentaError({
    code: 'AGENT_NO_PROVIDER',
    message: `"${agentName}" has no configured LLM provider (wants "${model.preferred}"${
      model.fallback === undefined ? '' : ` or "${model.fallback}"`
    }).`,
    hint: 'Configure a provider from the admin\'s "Providers" screen before running this agent.',
  })
}

async function skillInstructionsFor(
  skills: AgentSkillStore,
  names: readonly string[] | undefined,
): Promise<string> {
  if (names === undefined || names.length === 0) return ''
  const all = await skills.list()
  const byId = new Map(all.map((skill) => [skill.id, skill]))
  const blocks = names
    .map((id) => byId.get(id))
    .filter((skill): skill is NonNullable<typeof skill> => skill !== undefined)
    .map((skill) => `### ${skill.name}\n${skill.instructions}`)
  if (blocks.length === 0) return ''
  return `\n\nAvailable skills:\n${blocks.join('\n\n')}`
}

export function createAgentRunner(options: AgentRunnerOptions): AgentRunner {
  const now = options.now ?? Date.now
  const budgetTrackers = new Map<string, BudgetTracker>()

  function budgetTrackerFor(agent: StoredAgent): BudgetTracker {
    const existing = budgetTrackers.get(agent.name)
    if (existing !== undefined) return existing
    const tracker =
      options.budgetTrackerFor?.(agent) ?? createBudgetTracker({ limits: agent.budget ?? {} })
    budgetTrackers.set(agent.name, tracker)
    return tracker
  }

  function actorFor(agentName: string): ToolContext['actor'] {
    // Full role, bounded not by the actor's own roles but by the manifest
    // itself (buildManifest only ever exposes the tools this agent's own
    // `tools` list names) — R4's real gate is what got into the manifest,
    // not what role string rides along with the call.
    return { id: `agent:${agentName}`, roles: ['admin', 'agent'] }
  }

  async function buildToolsFor(agent: StoredAgent): Promise<readonly ExecutableTool[]> {
    const context = {
      site: toolSiteOf(options.site),
      actor: actorFor(agent.name),
      logger: silentLogger,
    }
    const own = buildManifest(options.tools, agent.tools, context)

    const delegates: ExecutableTool[] = []
    for (const subagentName of agent.subagents ?? []) {
      const subagent = await options.agents.get(subagentName)
      if (subagent === undefined) continue // validated at declaration time; a since-removed name is skipped rather than crashing a run
      const subContext = {
        site: toolSiteOf(options.site),
        actor: actorFor(subagent.name),
        logger: silentLogger,
      }
      // The sub-agent's own tool calls (made inside its own `runAgentLoop`,
      // via `createAgentDelegateTool`) are gated and journalled exactly like
      // the parent's — its own autonomy config, its own name in the audit
      // trail — never a bare pass-through just because they were reached one
      // hop away from the top-level run.
      const subTools = withAuditForManifest(
        withAutonomyForManifest(buildManifest(options.tools, subagent.tools, subContext), {
          agentName: subagent.name,
          autonomy: subagent.autonomy ?? { default: 'observe' },
          approvalQueue: options.approvalQueue,
        }),
        {
          auditLog: options.auditLog,
          agentName: subagent.name,
          actor: actorFor(subagent.name),
          ...(subagent.autonomy?.default === undefined
            ? {}
            : { autonomyLevel: subagent.autonomy.default }),
        },
      )
      let subClient: ProviderClient
      try {
        subClient = resolveProvider(subagent.name, subagent.model, options.providers)
      } catch {
        continue // no provider for the sub-agent: it simply is not offered as a delegate tool this run (R2)
      }
      const identity = await options.agents.readIdentity(subagent.name)
      const { system } = assembleContext({
        site: siteContextOf(options.site),
        agent: { name: subagent.name, ...identity },
        task: { instruction: 'Carry out whatever task the parent agent delegates to you.' },
      })
      const delegateDefinition = createAgentDelegateTool({
        subagentName: subagent.name,
        client: subClient,
        tools: subTools,
        system,
        maxTokens: SUBAGENT_MAX_TOKENS,
      })
      // `createAgentDelegateTool` returns a contract-C `ToolDefinition`, the
      // same shape every other core tool does — `buildManifest` is the one
      // place that already knows how to turn one into the `ExecutableTool`
      // the loop calls, so it is reused here for a one-tool "registry"
      // rather than duplicating that conversion.
      const [delegateExecutable] = buildManifest(
        createToolRegistry([delegateDefinition]),
        [delegateDefinition.name],
        context,
      )
      if (delegateExecutable !== undefined) delegates.push(delegateExecutable)
    }

    return [...own, ...delegates]
  }

  return {
    async run(name, runOptions) {
      const agent = await options.agents.get(name)
      if (agent === undefined) throw agentUnknown(name)
      if (!agent.enabled || options.killSwitchFor(name).isActive()) throw agentDisabled(name)

      // Resolved and possibly thrown (AGENT_NO_PROVIDER) *before* any tool is
      // built or any message assembled — the R2 guarantee this module exists
      // to keep: no provider configured means no network call, full stop.
      const client = resolveProvider(agent.name, agent.model, options.providers)

      const tools = withAuditForManifest(
        withAutonomyForManifest(await buildToolsFor(agent), {
          agentName: agent.name,
          autonomy: agent.autonomy ?? { default: 'observe' },
          approvalQueue: options.approvalQueue,
        }),
        {
          auditLog: options.auditLog,
          agentName: agent.name,
          actor: actorFor(agent.name),
          model: client.model,
          ...(agent.autonomy?.default === undefined
            ? {}
            : { autonomyLevel: agent.autonomy.default }),
        },
      )

      const identity = await options.agents.readIdentity(agent.name)
      const skillsText = await skillInstructionsFor(options.skills, agent.skills)
      const { system, dataMessages } = assembleContext({
        site: siteContextOf(options.site),
        agent: { name: agent.name, ...identity },
        task: { instruction: `${runOptions.instruction}${skillsText}` },
      })

      const startedAt = now()
      let result: RunResult
      try {
        result = await runAgentLoop({
          client,
          system,
          messages: [
            ...dataMessages,
            { role: 'user', content: 'Carry out the TASK described in your system context.' },
          ],
          tools,
          maxTokens: runOptions.maxTokens ?? options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
          budget: budgetTrackerFor(agent),
          killSwitch: options.killSwitchFor(agent.name),
          ...(runOptions.signal === undefined ? {} : { signal: runOptions.signal }),
        })
      } catch (error) {
        await recordRun(options.auditLog, agent.name, runOptions.trigger, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: now() - startedAt,
        })
        throw error
      }

      await recordRun(options.auditLog, agent.name, runOptions.trigger, {
        ok: true,
        stopReason: result.stopReason,
        steps: result.steps.length,
        usage: result.usage,
        durationMs: now() - startedAt,
      })

      return {
        agent: agent.name,
        stopReason: result.stopReason,
        finalText: result.finalText,
        steps: result.steps.length,
        usage: result.usage,
      }
    },
  }
}

const silentLogger: ToolContext['logger'] = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

async function recordRun(
  auditLog: AuditLogLike,
  agentName: string,
  trigger: string | undefined,
  diff: Readonly<Record<string, unknown>>,
): Promise<void> {
  try {
    await auditLog.record({
      actorId: `agent:${agentName}`,
      actorRoles: ['agent'],
      action: 'agent.run',
      diff: { agent: agentName, trigger: trigger ?? 'manual', ...diff },
    })
  } catch {
    // ADR-0018: a write that fails must never fail the action it is auditing.
  }
}
