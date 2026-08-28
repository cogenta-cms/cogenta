import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/agents` — "état, autonomie, budget, historique, traces" (L5 task 9),
 * genuinely editable and runnable as of L22 task 1. Structural, not
 * `@cogenta/agents`-typed: this package must not gain a hard dependency on
 * the runtime package just to describe the handful of methods this router
 * actually calls, same reasoning `ContentServiceLike` uses for `@cogenta/api`
 * inside `@cogenta/agents` — the dependency arrow only ever points one way.
 */

export interface AgentSummary {
  readonly name: string
  readonly tools: readonly string[]
  readonly autonomy?: unknown
  readonly budget?: unknown
  /**
   * Fiche 4 (L21 task 4): the rest of contract C's `AgentDeclaration` this
   * router now passes through unchanged, same `unknown` treatment as
   * `autonomy`/`budget` above and for the same reason — this package stays
   * structural, not `@cogenta/agents`-typed. Each is optional because the
   * underlying declaration field is; a registry backed by a declaration
   * that never set one simply omits it from the wire response too.
   */
  readonly skills?: unknown
  readonly subagents?: unknown
  readonly model?: unknown
  readonly memory?: unknown
  readonly triggers?: unknown
  /** L22 task 1: `true` for the superagent and the two seeded examples — undeletable, always editable. Optional so a registry that predates this field (a test double) still satisfies the interface. */
  readonly builtin?: boolean
}

export interface AgentUsage {
  readonly tokensToday: number
  readonly eurThisMonth: number
  readonly callsThisHour: number
}

/** The wire shape of a create/update request body — deliberately loose (`unknown` for the nested contract-C fields, exactly like `AgentSummary`); `AgentRegistryLike.create`/`update` is what actually validates it against a real `AgentDeclaration`. */
export interface AgentWriteInput {
  readonly name?: string
  readonly identity?: {
    readonly role: string
    readonly objectives: readonly string[]
    readonly style?: string
    /** Fiche 55 task 1 — extra standing instructions, distinct from `style`. Additive, optional. */
    readonly systemPrompt?: string
  }
  readonly model?: unknown
  readonly tools?: readonly string[]
  readonly skills?: readonly string[]
  readonly subagents?: readonly string[]
  readonly autonomy?: unknown
  readonly budget?: unknown
  readonly memory?: unknown
  readonly triggers?: unknown
  readonly enabled?: boolean
}

export interface AgentRegistryLike {
  list(): readonly AgentSummary[]
  get(name: string): AgentSummary | undefined
  enable(name: string): void
  disable(name: string): void
  isEnabled(name: string): boolean
  /** Absent when no budget tracker exists for this agent (no `budget` configured, or the agent has never run). */
  usageFor?(name: string): AgentUsage | undefined
  /**
   * The four L22 task 1 capabilities — all optional so a caller that only
   * ever built a fixed, in-memory registry (`createAgentRegistry`, still a
   * valid `AgentRegistryLike` on its own) is not forced to implement them:
   * the router answers `AGENT_REGISTRY_READ_ONLY` for a route it has no
   * backing capability for, rather than crashing.
   */
  create?(input: AgentWriteInput): Promise<void>
  update?(name: string, patch: AgentWriteInput): Promise<void>
  remove?(name: string): Promise<void>
  readIdentity?(name: string): Promise<{
    readonly role: string
    readonly objectives: readonly string[]
    readonly style?: string
    readonly systemPrompt?: string
  }>
}

export interface AgentRunSummary {
  readonly agent: string
  readonly stopReason: string
  readonly finalText: string | null
  readonly steps: number
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number }
}

/** Backs `POST /api/agents/:name/run` — absent means the site has no live runner wired (`AGENT_RUNTIME_UNAVAILABLE`), never a 500. */
export interface AgentRunnerLike {
  run(name: string, instruction: string, trigger?: string): Promise<AgentRunSummary>
}

export interface TraceStoreLike {
  list(query?: { agentName?: string; limit?: number }): Promise<readonly unknown[]>
}

export interface AuditLogLike {
  list(filter?: { actorId?: string; limit?: number }): Promise<readonly unknown[]>
}

export interface AgentsRouterOptions {
  readonly agents: AgentRegistryLike
  /** Omitted entirely when no trace store is wired in — `traces` then answers with an empty list, not an error (R2: a piece not configured is not a failure). */
  readonly traces?: TraceStoreLike
  /** Omitted entirely when no audit log is wired in — same empty-list fallback as `traces`. */
  readonly audit?: AuditLogLike
  /** Omitted when this site has no live agent runner — `POST .../run` then answers `AGENT_RUNTIME_UNAVAILABLE` rather than crashing. */
  readonly runner?: AgentRunnerLike
  /** Mount point. `/api/agents` by default. */
  readonly basePath?: string
}

export interface AgentsRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/agents'

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may manage agents.',
    hint: 'Ask someone with the admin role to check this for you.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * Pre-existing gap this lot's own e2e test caught: an agent's `name` is a
 * free-form contract-C string (the seeded superagent is literally "Cogenta
 * Agent", with a space), not a slug — every other router with a similar
 * dynamic segment (`taxonomy-router.ts`, `menu-router.ts`, `forms-router.ts`,
 * …) already `decodeURIComponent`s each segment for exactly this reason;
 * this one never did, because its one pre-L22 caller ("security") happened
 * to need no encoding at all.
 */
function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null
  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'Agent routes are /api/agents, /api/agents/:name, /:name/enable, /disable, /run, /traces and /history.',
  })
}

function agentNotFound(name: string): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: `No agent named "${name}" is registered.`,
    hint: 'Check the name against GET /api/agents.',
  })
}

function registryReadOnly(capability: string): CogentaError {
  return new CogentaError({
    code: 'AGENT_REGISTRY_READ_ONLY',
    message: `This site's agent registry does not support "${capability}".`,
    hint: 'This is a server configuration limit, not something the request can fix.',
  })
}

function runtimeUnavailable(): CogentaError {
  return new CogentaError({
    code: 'AGENT_RUNTIME_UNAVAILABLE',
    message: 'No agent runner is configured for this site.',
    hint: 'This is a server configuration limit, not something the request can fix.',
  })
}

function requireAgent(options: AgentsRouterOptions, name: string): AgentSummary {
  const agent = options.agents.get(name)
  if (agent === undefined) throw agentNotFound(name)
  return agent
}

function summaryOf(options: AgentsRouterOptions, agent: AgentSummary): Record<string, unknown> {
  return {
    name: agent.name,
    tools: agent.tools,
    autonomy: agent.autonomy,
    budget: agent.budget,
    enabled: options.agents.isEnabled(agent.name),
    usage: options.agents.usageFor?.(agent.name),
    skills: agent.skills,
    subagents: agent.subagents,
    model: agent.model,
    memory: agent.memory,
    triggers: agent.triggers,
    builtin: agent.builtin ?? false,
  }
}

function parseLimit(query: RestRequest['query']): number | undefined {
  const raw = single(query, 'limit')
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'The "limit" query parameter is not a page size.',
      hint: 'Pass a whole number of 1 or more.',
    })
  }
  return parsed
}

/**
 * A create request needs enough of contract C's `AgentDeclaration` for the
 * registry to build a real identity document and pick a provider — checked
 * here, at the wire boundary, rather than left to whatever low-level error
 * a store's own file-write might throw on `undefined.role`.
 */
function requireCreateFields(body: AgentWriteInput): void {
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new CogentaError({
      code: 'AGENT_DEFINITION_INVALID',
      message: 'A new agent needs a non-empty "name".',
      hint: 'Send { "name": "…", "identity": { "role": "…", "objectives": […] }, "model": { "preferred": "…" }, "tools": […] }.',
    })
  }
  if (
    typeof body.identity !== 'object' ||
    body.identity === null ||
    typeof body.identity.role !== 'string' ||
    body.identity.role.trim().length === 0 ||
    !Array.isArray(body.identity.objectives)
  ) {
    throw new CogentaError({
      code: 'AGENT_DEFINITION_INVALID',
      message: 'A new agent needs "identity": { "role": "…", "objectives": […] }.',
      hint: 'Objectives may be an empty array, but role must be non-empty text.',
    })
  }
  if (body.identity.systemPrompt !== undefined && typeof body.identity.systemPrompt !== 'string') {
    throw new CogentaError({
      code: 'AGENT_DEFINITION_INVALID',
      message: '"identity.systemPrompt", when present, must be text.',
      hint: 'Omit it, or send a non-empty string.',
    })
  }
  const model = body.model as { readonly preferred?: unknown } | undefined
  if (
    typeof model !== 'object' ||
    model === null ||
    typeof model.preferred !== 'string' ||
    model.preferred.trim().length === 0
  ) {
    throw new CogentaError({
      code: 'AGENT_DEFINITION_INVALID',
      message: 'A new agent needs "model": { "preferred": "…" }.',
      hint: 'Name the LLM provider this agent should use — anthropic, openai or google.',
    })
  }
  if (!Array.isArray(body.tools)) {
    throw new CogentaError({
      code: 'AGENT_DEFINITION_INVALID',
      message: 'A new agent needs a "tools" array (may be empty).',
      hint: 'List the contract-C tool names this agent may call.',
    })
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'AGENT_DEFINITION_INVALID',
      message: 'The request body is not an object.',
      hint: 'Send a JSON object.',
    })
  }
  return body as Record<string, unknown>
}

export function createAgentsRouter(options: AgentsRouterOptions): AgentsRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()
        const [name, action, extra] = segments

        // GET|POST /api/agents
        if (name === undefined) {
          if (method === 'GET') {
            const data = options.agents.list().map((agent) => summaryOf(options, agent))
            return jsonResponse(200, { data })
          }
          if (method === 'POST') {
            if (options.agents.create === undefined) throw registryReadOnly('create')
            const body = asRecord(request.body) as AgentWriteInput
            requireCreateFields(body)
            await options.agents.create(body)
            const created = requireAgent(options, String(body.name))
            return jsonResponse(201, { data: summaryOf(options, created) })
          }
          return methodNotAllowed(['GET', 'POST'])
        }

        // GET|PATCH|DELETE /api/agents/:name
        if (action === undefined) {
          if (method === 'GET') {
            const agent = requireAgent(options, name)
            return jsonResponse(200, { data: summaryOf(options, agent) })
          }
          if (method === 'PATCH') {
            if (options.agents.update === undefined) throw registryReadOnly('update')
            requireAgent(options, name)
            const body = asRecord(request.body) as AgentWriteInput
            await options.agents.update(name, body)
            const updated = requireAgent(options, name)
            return jsonResponse(200, { data: summaryOf(options, updated) })
          }
          if (method === 'DELETE') {
            if (options.agents.remove === undefined) throw registryReadOnly('remove')
            requireAgent(options, name)
            await options.agents.remove(name)
            return jsonResponse(200, { data: { name, removed: true } })
          }
          return methodNotAllowed(['GET', 'PATCH', 'DELETE'])
        }

        if (extra !== undefined) throw noRoute()

        // POST /api/agents/:name/enable | /disable
        if (action === 'enable' || action === 'disable') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          requireAgent(options, name)
          if (action === 'enable') options.agents.enable(name)
          else options.agents.disable(name)
          return jsonResponse(200, { data: { name, enabled: options.agents.isEnabled(name) } })
        }

        // POST /api/agents/:name/run — "Run now" from the admin, or any
        // future caller that wants to invoke this agent on demand rather
        // than waiting for a trigger.
        if (action === 'run') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          requireAgent(options, name)
          if (options.runner === undefined) throw runtimeUnavailable()
          const body = asRecord(request.body)
          const instruction = body['instruction']
          if (typeof instruction !== 'string' || instruction.trim().length === 0) {
            throw new CogentaError({
              code: 'AGENT_DEFINITION_INVALID',
              message: 'A run needs a non-empty "instruction".',
              hint: 'Send { "instruction": "…" }.',
            })
          }
          const summary = await options.runner.run(name, instruction, 'manual')
          return jsonResponse(200, { data: summary })
        }

        // GET /api/agents/:name/identity
        if (action === 'identity') {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          requireAgent(options, name)
          if (options.agents.readIdentity === undefined) throw registryReadOnly('readIdentity')
          const identity = await options.agents.readIdentity(name)
          return jsonResponse(200, { data: identity })
        }

        // GET /api/agents/:name/traces
        if (action === 'traces') {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          requireAgent(options, name)
          const limit = parseLimit(request.query)
          const data =
            options.traces === undefined
              ? []
              : await options.traces.list({
                  agentName: name,
                  ...(limit === undefined ? {} : { limit }),
                })
          return jsonResponse(200, { data })
        }

        // GET /api/agents/:name/history
        if (action === 'history') {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          requireAgent(options, name)
          const limit = parseLimit(request.query)
          const data =
            options.audit === undefined
              ? []
              : await options.audit.list({
                  actorId: `agent:${name}`,
                  ...(limit === undefined ? {} : { limit }),
                })
          return jsonResponse(200, { data })
        }

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
