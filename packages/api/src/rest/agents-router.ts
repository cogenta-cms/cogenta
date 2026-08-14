import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * `/api/agents` — "état, autonomie, budget, historique, traces" (L5 task 9).
 * Structural, not `@cogenta/agents`-typed: this package must not gain a
 * hard dependency on the runtime package just to describe the handful of
 * methods this router actually calls, same reasoning `ContentServiceLike`
 * uses for `@cogenta/api` inside `@cogenta/agents` — the dependency arrow
 * only ever points one way.
 */

export interface AgentSummary {
  readonly name: string
  readonly tools: readonly string[]
  readonly autonomy?: unknown
  readonly budget?: unknown
}

export interface AgentUsage {
  readonly tokensToday: number
  readonly eurThisMonth: number
  readonly callsThisHour: number
}

export interface AgentRegistryLike {
  list(): readonly AgentSummary[]
  get(name: string): AgentSummary | undefined
  enable(name: string): void
  disable(name: string): void
  isEnabled(name: string): boolean
  /** Absent when no budget tracker exists for this agent (no `budget` configured, or the agent has never run). */
  usageFor?(name: string): AgentUsage | undefined
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

function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null
  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
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

function agentNotFound(name: string): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: `No agent named "${name}" is registered.`,
    hint: 'Check the name against GET /api/agents.',
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

export function createAgentsRouter(options: AgentsRouterOptions): AgentsRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: 'No route matches this path.',
            hint: 'Agent routes are /api/agents and /api/agents/:name.',
          })
        }
        const method = request.method.toUpperCase()
        const [name, action, extra] = segments

        // GET /api/agents
        if (name === undefined) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const data = options.agents.list().map((agent) => summaryOf(options, agent))
          return jsonResponse(200, { data })
        }

        // GET /api/agents/:name
        if (action === undefined) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const agent = requireAgent(options, name)
          return jsonResponse(200, { data: summaryOf(options, agent) })
        }

        if (extra !== undefined) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: 'No route matches this path.',
            hint: 'Agent routes are /api/agents/:name/enable, /disable, /traces and /history.',
          })
        }

        // POST /api/agents/:name/enable | /disable
        if (action === 'enable' || action === 'disable') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          requireAgent(options, name)
          if (action === 'enable') options.agents.enable(name)
          else options.agents.disable(name)
          return jsonResponse(200, { data: { name, enabled: options.agents.isEnabled(name) } })
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

        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: 'No route matches this path.',
          hint: 'Agent routes are /api/agents/:name/enable, /disable, /traces and /history.',
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
