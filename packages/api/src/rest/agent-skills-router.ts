import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/agent-skills` — L22 task 1bis's "Skills" screen: named instruction
 * text an agent loads into its context. Named `agent-skills`, not `skills`,
 * to avoid colliding with L7's marketplace skill registry — a different
 * concept entirely (see `@cogenta/agents`' `skills/library.ts` module
 * comment). Admin-only, same posture as `/api/agents` and `/api/providers`.
 */

export interface AgentSkillSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly enabledByDefault: boolean
  readonly builtin: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AgentSkillRegistryLike {
  list(): Promise<readonly AgentSkillSummary[]>
  get(id: string): Promise<AgentSkillSummary | undefined>
  create(input: {
    readonly name: string
    readonly description: string
    readonly instructions: string
    readonly enabledByDefault?: boolean
  }): Promise<AgentSkillSummary>
  update(
    id: string,
    patch: {
      readonly name?: string
      readonly description?: string
      readonly instructions?: string
      readonly enabledByDefault?: boolean
    },
  ): Promise<AgentSkillSummary>
  remove(id: string): Promise<void>
}

export interface AgentSkillsRouterOptions {
  readonly skills: AgentSkillRegistryLike
  /** Mount point. `/api/agent-skills` by default. */
  readonly basePath?: string
}

export interface AgentSkillsRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/agent-skills'

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may manage agent skills.',
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
    hint: 'Agent-skill routes are /api/agent-skills and /api/agent-skills/:id.',
  })
}

function skillNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'AGENT_SKILL_UNKNOWN',
    message: `No skill with id "${id}".`,
    hint: 'Check the id against GET /api/agent-skills.',
  })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'AGENT_SKILL_UNKNOWN',
      message: 'The request body is not an object.',
      hint: 'Send a JSON object.',
    })
  }
  return body as Record<string, unknown>
}

export function createAgentSkillsRouter(options: AgentSkillsRouterOptions): AgentSkillsRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()
        const [id, extra] = segments

        // GET|POST /api/agent-skills
        if (id === undefined) {
          if (method === 'GET') return jsonResponse(200, { data: await options.skills.list() })
          if (method === 'POST') {
            const body = asRecord(request.body)
            const name = body['name']
            const description = body['description']
            const instructions = body['instructions']
            if (typeof name !== 'string' || name.trim().length === 0) {
              throw new CogentaError({
                code: 'AGENT_SKILL_UNKNOWN',
                message: 'A skill needs a non-empty "name".',
                hint: 'Send { "name": "…", "description": "…", "instructions": "…" }.',
              })
            }
            const enabledByDefault = body['enabledByDefault']
            const created = await options.skills.create({
              name,
              description: typeof description === 'string' ? description : '',
              instructions: typeof instructions === 'string' ? instructions : '',
              ...(typeof enabledByDefault === 'boolean' ? { enabledByDefault } : {}),
            })
            return jsonResponse(201, { data: created })
          }
          return methodNotAllowed(['GET', 'POST'])
        }

        if (extra !== undefined) throw noRoute()

        if (method === 'GET') {
          const found = await options.skills.get(id)
          if (found === undefined) throw skillNotFound(id)
          return jsonResponse(200, { data: found })
        }

        if (method === 'PATCH') {
          const body = asRecord(request.body)
          const name = body['name']
          const description = body['description']
          const instructions = body['instructions']
          const enabledByDefault = body['enabledByDefault']
          const updated = await options.skills.update(id, {
            ...(typeof name === 'string' ? { name } : {}),
            ...(typeof description === 'string' ? { description } : {}),
            ...(typeof instructions === 'string' ? { instructions } : {}),
            ...(typeof enabledByDefault === 'boolean' ? { enabledByDefault } : {}),
          })
          return jsonResponse(200, { data: updated })
        }

        if (method === 'DELETE') {
          await options.skills.remove(id)
          return jsonResponse(200, { data: { id, removed: true } })
        }

        return methodNotAllowed(['GET', 'PATCH', 'DELETE'])
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
