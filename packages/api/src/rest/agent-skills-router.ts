import { parseSkillFile } from '@cogenta/agents'
import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/agent-skills` — L22 task 1bis's "Skills" screen: named instruction
 * text an agent loads into its context. Named `agent-skills`, not `skills`,
 * to avoid colliding with L7's marketplace skill registry — a different
 * concept entirely (see `@cogenta/agents`' `skills/library.ts` module
 * comment). Admin-only, same posture as `/api/agents` and `/api/providers`.
 *
 * **Wire contract changed in L24 task 4.** The admin screen now edits a
 * skill as raw Markdown — the exact `SKILL.md` a real Claude Code/Codex
 * skill ships as — rather than separate name/description/instructions form
 * fields. `POST`/`PATCH` therefore take `{ content: string }`
 * (frontmatter + body) instead of the three separate fields; this router
 * parses it with the very same `parseSkillFile` the file-based stores use,
 * and delegates the *structured* result to `AgentSkillRegistryLike` —
 * which keeps that interface, and therefore `createSkillRegistryAdapter` in
 * `@cogenta/cli`'s `agent-runtime.ts`, unchanged. Every response now also
 * carries `content`, so a `GET` can feed the admin's editor without a
 * second round trip to reconstruct it.
 */

export interface AgentSkillSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly instructions: string
  /** The exact `SKILL.md` text (frontmatter + body) this record renders to. */
  readonly content: string
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

/**
 * Parses the `content` field of a request body — a raw `SKILL.md` (frontmatter
 * + body) — into the structured `{ name, description, instructions }` shape
 * `AgentSkillRegistryLike` still speaks. Reuses `parseSkillFile` rather than
 * a second Markdown/frontmatter reader (R9), so a malformed submission fails
 * with the exact same `SKILL_DEFINITION_INVALID` a file-based skill store
 * would raise for the same text.
 */
function parseContent(content: unknown): {
  name: string
  description: string
  instructions: string
} {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new CogentaError({
      code: 'AGENT_SKILL_UNKNOWN',
      message: 'A skill needs a non-empty "content" (a SKILL.md — frontmatter and body).',
      hint: 'Send { "content": "---\\nname: …\\ndescription: …\\n---\\n\\n…" }.',
    })
  }
  const { metadata, instructions } = parseSkillFile('agent-skill', content)
  return { name: metadata.name, description: metadata.description, instructions }
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
            const { name, description, instructions } = parseContent(body['content'])
            const enabledByDefault = body['enabledByDefault']
            const created = await options.skills.create({
              name,
              description,
              instructions,
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
          const content = body['content']
          const enabledByDefault = body['enabledByDefault']
          const parsed = content === undefined ? null : parseContent(content)
          const updated = await options.skills.update(id, {
            ...(parsed === null
              ? {}
              : {
                  name: parsed.name,
                  description: parsed.description,
                  instructions: parsed.instructions,
                }),
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
