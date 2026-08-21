import { join } from 'node:path'
import {
  type AgentDeclarationStore,
  type AgentProviderRegistryLike,
  type AgentRunner,
  type AgentSkillStore,
  type ContentServiceLike,
  createAgentRunner,
  createContentDeleteTool,
  createContentPublishTool,
  createContentReadTool,
  createContentWriteDraftTool,
  createDepsScanTool,
  createDocumentExtractTool,
  createFileAgentDeclarationStore,
  createFileAgentSkillStore,
  createFileProviderConfigStore,
  createKillSwitch,
  createMediaReadTool,
  createMediaWriteTool,
  createMemoryApprovalQueue,
  createProviderRegistry,
  createSiteConfigReadTool,
  createToolRegistry,
  ensureBuiltinAgentSkills,
  ensureBuiltinAgents,
  type MutableKillSwitch,
  PROVIDER_NAMES,
  type ProviderConfigStore,
  type ProviderName,
  resolveProviderRegistryConfig,
  type ToolDefinition,
} from '@cogenta/agents'
import type {
  AgentRegistryLike,
  AgentRunnerLike,
  AgentSkillRegistryLike,
  ContentService,
  ProviderRegistryLike,
} from '@cogenta/api'
import type { AuditLog } from '@cogenta/auth'
import type { Logger, MediaStore } from '@cogenta/core'

/**
 * L22 tasks 1/1bis — where the runtime `@cogenta/agents` provides finally
 * meets a running site. `@cogenta/agents` knows how to run an agent given a
 * tool registry, a provider registry and stores for declarations/skills/
 * provider config; it does not know how to build a `ContentServiceLike` out
 * of this codebase's real `ContentService`, or where on disk a site keeps
 * its data — that translation is this module's whole job, the same role
 * `assistant.ts` already plays for L18's toolset.
 *
 * Tool availability is not gated by whether a provider is configured (R2):
 * the tool registry, the agent/skill/provider stores, and every CRUD route
 * all work with zero LLM provider set up. Only `AgentRunner.run()` — one
 * synchronous provider lookup before any network call — refuses, per
 * `agents/orchestrator.ts`'s own `AGENT_NO_PROVIDER` guarantee.
 */

const AGENTS_SUBDIR = 'agents'
const SKILLS_SUBDIR = 'skills'
const PROVIDERS_SUBDIR = 'providers'

export interface BuildAgentRuntimeOptions {
  /** `.cogenta/agents-runtime` under the project root, by convention — see `runServe`. */
  readonly dataDir: string
  /** For `deps.scan`, which reads this site's own `package.json`. */
  readonly projectRoot: string
  readonly signingKey: string
  readonly site: {
    readonly name: string
    readonly url?: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  readonly contentService: ContentService
  readonly mediaStore: MediaStore
  readonly auditLog: AuditLog
  readonly logger: Logger
}

export interface AgentRuntimeAssembly {
  readonly agentRegistry: AgentRegistryLike
  readonly agentRunner: AgentRunnerLike
  readonly providerRegistry: ProviderRegistryLike
  readonly skillRegistry: AgentSkillRegistryLike
  readonly summary: string
}

/**
 * `ContentService` (real, `@cogenta/api`) adapted to the narrow
 * `ContentServiceLike` the core content tools declare against — the exact
 * same seam `packages/cli/src/commands/mcp.ts`'s `contentServiceLikeOf`
 * already uses, duplicated rather than shared across two CLI entry points
 * that otherwise have nothing else in common (one is a stdio command, the
 * other lives inside a long-running server).
 */
function contentServiceLikeOf(service: ContentService): ContentServiceLike {
  return {
    read: (context, collection, id, opts) =>
      service.read(context, collection, id, opts) as unknown as Promise<Record<string, unknown>>,
    create: (context, collection, input, opts) =>
      service.create(context, collection, input, opts) as unknown as Promise<
        Record<string, unknown>
      >,
    update: (context, collection, id, input, opts) =>
      service.update(context, collection, id, input, opts) as unknown as Promise<
        Record<string, unknown>
      >,
    publish: (context, collection, id, input, opts) =>
      service.publish(context, collection, id, input, opts) as unknown as Promise<
        Record<string, unknown>
      >,
    remove: (context, collection, id) => service.remove(context, collection, id),
  }
}

function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value)
}

/**
 * Refreshed after every write to `ProviderConfigStore` (the providers
 * router calls `refresh()` after each mutation) — an admin who saves a new
 * key takes effect on the next agent run, no restart, without this
 * runtime's one long-lived `AgentRunner` (and the per-agent budget
 * trackers it holds) being torn down and rebuilt on every request.
 */
function createLiveProviderRegistry(store: ProviderConfigStore): AgentProviderRegistryLike & {
  refresh(): Promise<void>
} {
  let registry = createProviderRegistry({})
  return {
    async refresh() {
      registry = createProviderRegistry(await resolveProviderRegistryConfig(store))
    },
    has: (name) => isProviderName(name) && registry.has(name),
    get: (name) => registry.get(name as ProviderName),
  }
}

function buildToolRegistry(options: {
  readonly contentService: ContentService
  readonly mediaStore: MediaStore
  readonly projectRoot: string
}) {
  const contentServiceLike: ContentServiceLike = contentServiceLikeOf(options.contentService)
  const definitions: ToolDefinition[] = [
    createContentReadTool(contentServiceLike),
    createContentWriteDraftTool(contentServiceLike),
    createContentPublishTool(contentServiceLike),
    createContentDeleteTool(contentServiceLike),
    createMediaReadTool(options.mediaStore),
    createMediaWriteTool(options.mediaStore),
    createSiteConfigReadTool(),
    createDocumentExtractTool(),
    createDepsScanTool({ projectRoot: options.projectRoot }),
  ]
  return createToolRegistry(definitions)
}

/**
 * Adapts `@cogenta/agents`' async `AgentDeclarationStore` to `@cogenta/api`'s
 * synchronous `AgentRegistryLike` — an in-memory cache, and a per-agent kill
 * switch shared with `AgentRunner` so `disable()` stops a run in flight, not
 * only future ones (mirrors `createAgentRegistry`'s own guarantee). The
 * cache is populated once, synchronously awaited, by `buildAgentRuntime`
 * calling `refresh()` before this runtime is handed to anything else — every
 * caller (the REST router, the runner) expects `list()`/`get()` to answer
 * correctly from the moment they receive this object, never after a first,
 * implicit mutation.
 */
function createRegistryAdapter(store: AgentDeclarationStore): {
  readonly registry: AgentRegistryLike
  readonly killSwitchFor: (name: string) => MutableKillSwitch
  readonly refresh: () => Promise<void>
} {
  let cache: readonly Awaited<ReturnType<AgentDeclarationStore['list']>>[number][] = []
  const killSwitches = new Map<string, MutableKillSwitch>()

  function killSwitchFor(name: string): MutableKillSwitch {
    const existing = killSwitches.get(name)
    if (existing !== undefined) return existing
    const created = createKillSwitch(false)
    killSwitches.set(name, created)
    return created
  }

  async function refresh(): Promise<void> {
    cache = await store.list()
    for (const agent of cache) {
      const kill = killSwitchFor(agent.name)
      if (agent.enabled) kill.deactivate()
      else kill.activate()
    }
  }

  const registry: AgentRegistryLike = {
    list: () => cache,
    get: (name) => cache.find((agent) => agent.name === name),
    enable(name) {
      killSwitchFor(name).deactivate()
      void store.setEnabled(name, true).then(refresh)
    },
    disable(name) {
      killSwitchFor(name).activate()
      void store.setEnabled(name, false).then(refresh)
    },
    isEnabled: (name) => !killSwitchFor(name).isActive(),
    async create(input) {
      await store.create(input as never)
      await refresh()
    },
    async update(name, patch) {
      await store.update(name, patch as never)
      await refresh()
    },
    async remove(name) {
      await store.remove(name)
      await refresh()
    },
    readIdentity: (name) => store.readIdentity(name),
  }

  return { registry, killSwitchFor, refresh }
}

function createSkillRegistryAdapter(store: AgentSkillStore): AgentSkillRegistryLike {
  return {
    list: () => store.list(),
    get: (id) => store.get(id),
    create: (input) => store.create(input),
    update: (id, patch) => store.update(id, patch),
    remove: (id) => store.remove(id),
  }
}

function createProviderRegistryAdapter(
  store: ProviderConfigStore,
  onMutated: () => Promise<void>,
): ProviderRegistryLike {
  return {
    names: [...PROVIDER_NAMES],
    list: () => store.list(),
    async upsert(input) {
      const saved = await store.upsert(input as never)
      await onMutated()
      return saved
    },
    async setEnabled(provider, enabled) {
      const saved = await store.setEnabled(provider as ProviderName, enabled)
      await onMutated()
      return saved
    },
    async updateSettings(provider, patch) {
      const saved = await store.updateSettings(provider as ProviderName, patch)
      await onMutated()
      return saved
    },
    async remove(provider) {
      await store.remove(provider as ProviderName)
      await onMutated()
    },
  }
}

/**
 * Assembles the whole L22 task 1/1bis runtime for one site: three file
 * stores (agents, agent skills, provider config — all under `dataDir`, R1),
 * the real tool registry, and the one `AgentRunner` this site's `/api/agents`
 * `run` route and any future trigger (cron, channel, chat — later tasks)
 * will share. Idempotent: safe to call on every `cogenta serve` boot,
 * including an upgrade from a pre-L22 site (`ensureBuiltinAgents`/
 * `ensureBuiltinAgentSkills` only ever add what is missing).
 */
export async function buildAgentRuntime(
  options: BuildAgentRuntimeOptions,
): Promise<AgentRuntimeAssembly> {
  const agentStore = createFileAgentDeclarationStore({ dir: join(options.dataDir, AGENTS_SUBDIR) })
  const skillStore = createFileAgentSkillStore({ dir: join(options.dataDir, SKILLS_SUBDIR) })
  const providerStore = createFileProviderConfigStore({
    dir: join(options.dataDir, PROVIDERS_SUBDIR),
    signingKey: options.signingKey,
  })

  await ensureBuiltinAgents(agentStore)
  await ensureBuiltinAgentSkills(skillStore)

  const {
    registry: agentRegistry,
    killSwitchFor,
    refresh: refreshAgentRegistry,
  } = createRegistryAdapter(agentStore)
  await refreshAgentRegistry()

  const liveProviders = createLiveProviderRegistry(providerStore)
  await liveProviders.refresh()

  const tools = buildToolRegistry({
    contentService: options.contentService,
    mediaStore: options.mediaStore,
    projectRoot: options.projectRoot,
  })

  const runner: AgentRunner = createAgentRunner({
    agents: agentStore,
    skills: skillStore,
    tools,
    providers: liveProviders,
    auditLog: options.auditLog,
    approvalQueue: createMemoryApprovalQueue(),
    site: options.site,
    killSwitchFor,
  })

  const agentRunner: AgentRunnerLike = {
    async run(name, instruction, trigger) {
      return runner.run(name, { instruction, ...(trigger === undefined ? {} : { trigger }) })
    },
  }

  const providerRegistry = createProviderRegistryAdapter(providerStore, () =>
    liveProviders.refresh(),
  )
  const skillRegistry = createSkillRegistryAdapter(skillStore)

  const configuredProviders = (await providerStore.list()).filter((p) => p.enabled)
  const summary =
    configuredProviders.length === 0
      ? 'agents: registered, no LLM provider configured (runs refuse before any network call)'
      : `agents: registered, ${configuredProviders.length} provider(s) configured (${configuredProviders
          .map((p) => p.provider)
          .join(', ')})`

  return { agentRegistry, agentRunner, providerRegistry, skillRegistry, summary }
}
