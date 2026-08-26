import { join } from 'node:path'
import {
  type AgentDeclarationStore,
  type AgentProviderRegistryLike,
  type AgentRunner,
  type AgentSkillStore,
  type ApprovalQueue,
  type ContentBrowseAccessContext,
  type ContentBrowseServiceLike,
  type ContentServiceLike,
  createAgentRunner,
  createContentCollectionsTool,
  createContentDeleteTool,
  createContentListTool,
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
  createNotFoundLogReadTool,
  createProviderRegistry,
  createRedirectCreateTool,
  createSiteConfigReadTool,
  createToolRegistry,
  ensureBuiltinAgentSkills,
  ensureBuiltinAgents,
  type MutableKillSwitch,
  type NotFoundLogReader,
  PROVIDER_NAMES,
  type ProviderConfigStore,
  type ProviderName,
  type RedirectWriter,
  resolveProviderRegistryConfig,
  type ToolDefinition,
  type ToolRegistry,
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
import { buildMcpToolDefinitions, type McpConnectionStore } from '@cogenta/mcp'
import { buildPath, type CollectionDefinition } from '@cogenta/schema'

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
  /** The site's schema — for `content.collections`/`content.list` (L22 task 3) to know which collections have a public route, and to compute one. */
  readonly collections: readonly CollectionDefinition[]
  /** For `logs.read_not_found` (L22 task 3, the Site Monitor's own tool). */
  readonly notFoundLog: NotFoundLogReader
  /** For `redirects.create` (L22 task 3). */
  readonly redirects: RedirectWriter
  /**
   * Injectable for tests — defaults to a fresh `createMemoryApprovalQueue()`.
   * A non-reversible, side-effecting tool call (every core content/media
   * write tool — `content.write_draft` included) always blocks on this
   * queue regardless of an agent's own autonomy level (`with-autonomy.ts`'s
   * `forcedApproval`, R6): nothing decides it on its own. A caller that
   * wants to observe or decide pending requests (an approvals screen, a
   * channel `/approve` command, or a test proving the *right* tool was
   * proposed for a write) needs the same instance this runtime actually
   * uses — hence this override and `AgentRuntimeAssembly.approvalQueue`
   * below, rather than a queue this module keeps entirely to itself.
   */
  readonly approvalQueue?: ApprovalQueue
  /**
   * Fiche 58 task 4 — external MCP connections this site has configured.
   * Optional so a caller that builds a runtime without the registry (an
   * older call site, a test) is unaffected: omitted, no MCP tool is ever
   * wired in, exactly as if no connection existed.
   */
  readonly mcpConnections?: McpConnectionStore
}

export interface AgentRuntimeAssembly {
  readonly agentRegistry: AgentRegistryLike
  readonly agentRunner: AgentRunnerLike
  readonly providerRegistry: ProviderRegistryLike
  readonly skillRegistry: AgentSkillRegistryLike
  /**
   * Exposed so `serve.ts` can build the L22 task 3 notice source
   * (`@cogenta/api`'s `createAgentApprovalsSource`) over the very same
   * queue `co-pilot` autonomy files into — never a second queue that would
   * disagree with what the runner actually proposed. Also the exact queue
   * L22 task 2's channel/chat surfaces (or a future approvals REST route)
   * would decide a pending write against — see
   * `BuildAgentRuntimeOptions.approvalQueue`.
   */
  readonly approvalQueue: ApprovalQueue
  readonly summary: string
  /**
   * Fiche 58 task 4 — rebuilds the MCP portion of this runtime's tool
   * registry from `BuildAgentRuntimeOptions.mcpConnections`'s *current*
   * state and swaps it in live. `serve.ts`'s `mcp-connections-router.ts`
   * `onMutated` hook calls this after every create/enable/disable/remove/
   * test/expose-tools mutation — the same "no restart needed" guarantee
   * `/api/providers` already gives (`createLiveProviderRegistry.refresh`).
   * A no-op when `mcpConnections` was never supplied.
   */
  refreshMcpTools(): Promise<void>
  /**
   * Closes every `McpClient` (and removes every sandbox working directory)
   * the *current* MCP tool assembly holds. A no-op when no MCP connection
   * was ever wired in. Call once, on server shutdown (`serve.ts`'s
   * `dispose`) — never mid-run, which would pull a live tool out from
   * under an agent still using it.
   */
  mcpDispose(): Promise<void>
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

/** The first string field a list item is worth labelling by — `title`/`name`/`heading` cover every blueprint collection this project ships; a collection using none of those still lists, just with a null title the model reads as "no obvious title" rather than a guess. */
function titleOf(values: Readonly<Record<string, unknown>>): string | null {
  const candidate = values.title ?? values.name ?? values.heading
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

/**
 * `ContentService` adapted to `content.collections`/`content.list`'s
 * `ContentBrowseServiceLike` (L22 task 3) — a second, separate adapter from
 * `contentServiceLikeOf` above, on purpose: those four CRUD tools and these
 * two read/browse ones need different shapes out of the same service
 * (`summary`/`list`/route-building versus single-entry read/write), and nothing
 * here overlaps with `ContentServiceLike`'s own contract enough to be worth
 * merging.
 *
 * `path` is computed here, not by the tool: this is the one place that has
 * both an entry's field values (`SerialisedEntry.values`) and its
 * collection's route pattern (`CollectionDefinition.routing`) in scope.
 * `buildPath` throws for a required param the values do not fill (`Content
 * Route Invalid`) — caught and turned into `null`, the same "cannot offer
 * this as a redirect target" signal an unrouted collection gets, rather than
 * a tool call failing over a values shape this adapter cannot second-guess.
 */
function contentBrowseServiceLikeOf(
  service: ContentService,
  collections: readonly CollectionDefinition[],
): ContentBrowseServiceLike {
  const byName = new Map(collections.map((collection) => [collection.name, collection]))

  function pathOf(
    collection: CollectionDefinition,
    entry: { readonly values: Readonly<Record<string, unknown>>; readonly locale: string },
  ): string | null {
    if (collection.routing === undefined) return null
    const params: Record<string, string> = {}
    for (const [key, value] of Object.entries(entry.values)) {
      if (typeof value === 'string') params[key] = value
    }
    try {
      return buildPath(collection, params, entry.locale)
    } catch {
      return null
    }
  }

  return {
    collections: async (context: ContentBrowseAccessContext) => {
      const summaries = await service.summary(context)
      return summaries.map((summary) => ({
        collection: summary.collection,
        total: summary.total,
        published: summary.published,
        routed: byName.get(summary.collection)?.routing !== undefined,
      }))
    },
    list: async (context: ContentBrowseAccessContext, collectionName, options) => {
      const collection = byName.get(collectionName)
      if (collection === undefined) return undefined
      const page = await service.list(context, collectionName, {
        filter: undefined,
        sort: { field: 'updatedAt', direction: 'desc' },
        limit: options.limit,
        cursor: undefined,
        locale: undefined,
        requestedState: 'published',
        requestedStatus: undefined,
        trashed: undefined,
        depth: 0,
      })
      return {
        items: page.items.map((item) => ({
          id: item.id,
          title: titleOf(item.values),
          path: pathOf(collection, { values: item.values, locale: item.locale }),
          status: item.status,
        })),
      }
    },
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
  readonly collections: readonly CollectionDefinition[]
  readonly notFoundLog: NotFoundLogReader
  readonly redirects: RedirectWriter
  /** Fiche 58 task 4 — every checked remote tool of every enabled MCP connection, already wrapped as a Contract C `ToolDefinition` by `buildMcpToolDefinitions`. Merged in exactly like every core tool above: an agent grants itself one by naming it in its own `tools` list, same as `content.read`. */
  readonly mcpDefinitions: readonly ToolDefinition[]
}) {
  const contentServiceLike: ContentServiceLike = contentServiceLikeOf(options.contentService)
  const contentBrowseServiceLike = contentBrowseServiceLikeOf(
    options.contentService,
    options.collections,
  )
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
    // L22 task 3 — the Site Monitor's toolset.
    createNotFoundLogReadTool(options.notFoundLog),
    createContentCollectionsTool(contentBrowseServiceLike),
    createContentListTool(contentBrowseServiceLike),
    createRedirectCreateTool(options.redirects),
    ...options.mcpDefinitions,
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
 * Fiche 58 task 4's "no restart needed" half — same idiom as
 * `createLiveProviderRegistry` above, applied to the whole tool registry
 * rather than just the provider one: `replace` swaps which underlying
 * `ToolRegistry` `list`/`get` read from, so an agent mid-run that already
 * holds a reference to this wrapper sees the new set on its very next
 * lookup, while a call already dispatched to an old `ExecutableTool`
 * finishes against the client it was actually built with (never torn out
 * from under it — see `refreshMcpTools`'s own comment on disposal order).
 */
function createLiveToolRegistry(initial: ToolRegistry): ToolRegistry & {
  replace(next: ToolRegistry): void
} {
  let current = initial
  return {
    list: () => current.list(),
    get: (name) => current.get(name),
    replace(next) {
      current = next
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

  const coreToolOptions = {
    contentService: options.contentService,
    mediaStore: options.mediaStore,
    projectRoot: options.projectRoot,
    collections: options.collections,
    notFoundLog: options.notFoundLog,
    redirects: options.redirects,
  }

  // Fiche 58 task 4 — built once, here, before the tool registry: every
  // enabled connection with at least one checked tool gets its own
  // sandboxed `McpClient` (`../client/stdio-client.js`'s floor — no
  // inherited environment, a dedicated cwd, a hard per-call timeout, a
  // best-effort resource watchdog), shared by every one of that
  // connection's exposed tools. A connection that fails to initialize is
  // logged and skipped, never thrown — one misbehaving external server
  // must not keep this whole runtime from starting (R2's own posture,
  // applied here to a different kind of "capability that may be absent").
  let mcpAssembly =
    options.mcpConnections === undefined
      ? { definitions: [] as readonly ToolDefinition[], dispose: async () => undefined }
      : await buildMcpToolDefinitions({ store: options.mcpConnections, logger: options.logger })

  // A live wrapper, not a fixed `ToolRegistry`: `refreshMcpTools` below
  // swaps what it points at, so an admin creating a connection or checking
  // a new tool from the "MCP Clients" screen takes effect on this
  // runtime's very next `createAgentRunner` lookup — no `cogenta serve`
  // restart, the same "no restart needed" guarantee `liveProviders`
  // already gives `/api/providers`.
  const tools = createLiveToolRegistry(
    buildToolRegistry({ ...coreToolOptions, mcpDefinitions: mcpAssembly.definitions }),
  )

  // Built once (or reused from `options.approvalQueue`, injectable for
  // tests) and handed both to the runner (where `co-pilot` autonomy files a
  // request) and back out on `AgentRuntimeAssembly` (where `serve.ts` reads
  // pending ones for the L22 task 3 notice source, and a channel/chat
  // surface or future approvals route could decide one) — the same object,
  // never two queues that could disagree.
  const approvalQueue = options.approvalQueue ?? createMemoryApprovalQueue()

  const runner: AgentRunner = createAgentRunner({
    agents: agentStore,
    skills: skillStore,
    tools,
    providers: liveProviders,
    auditLog: options.auditLog,
    approvalQueue,
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

  /**
   * Fiche 58 task 4 — rebuilds the MCP portion of the tool registry from
   * the connection store's *current* state (every enabled connection,
   * whatever is exposed right now) and swaps it into `tools` atomically
   * (`createLiveToolRegistry`'s `replace`). The *old* clients are closed
   * only after the swap, never before: a tool call already in flight
   * against the previous `McpClient` finishes normally, and nothing new
   * can be dispatched to it once `tools.replace` has taken effect.
   */
  async function doRefreshMcpTools(): Promise<void> {
    if (options.mcpConnections === undefined) return
    const nextAssembly = await buildMcpToolDefinitions({
      store: options.mcpConnections,
      logger: options.logger,
    })
    const previous = mcpAssembly
    tools.replace(
      buildToolRegistry({ ...coreToolOptions, mcpDefinitions: nextAssembly.definitions }),
    )
    mcpAssembly = nextAssembly
    await previous.dispose()
  }

  // Serialised, not called bare: two `refreshMcpTools()` calls racing (an
  // admin's own double-click on "test connection", or two REST calls
  // overlapping) would otherwise let one call's freshly-built assembly —
  // including its own genuinely spawned `stdio` processes and sandbox
  // directories — be overwritten by the other's `mcpAssembly = ...` before
  // ever being disposed, leaking an unsandboxed process that outlives even
  // this runtime's own `mcpDispose()` at shutdown (found by the fiche 58
  // security review). Chaining onto the same promise, success or failure,
  // guarantees at most one `doRefreshMcpTools` runs at a time and every
  // built assembly is either adopted or disposed, never orphaned.
  let refreshChain: Promise<void> = Promise.resolve()
  function refreshMcpTools(): Promise<void> {
    refreshChain = refreshChain.then(doRefreshMcpTools, doRefreshMcpTools)
    return refreshChain
  }

  const configuredProviders = (await providerStore.list()).filter((p) => p.enabled)
  const summary =
    configuredProviders.length === 0
      ? 'agents: registered, no LLM provider configured (runs refuse before any network call)'
      : `agents: registered, ${configuredProviders.length} provider(s) configured (${configuredProviders
          .map((p) => p.provider)
          .join(', ')})`

  return {
    agentRegistry,
    agentRunner,
    providerRegistry,
    skillRegistry,
    approvalQueue,
    summary,
    refreshMcpTools,
    mcpDispose: () => mcpAssembly.dispose(),
  }
}
