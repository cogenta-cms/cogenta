import { CogentaError } from '@cogenta/core'
import { type Actor, ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * Fiche 45 task 3 — `/api/prompt-templates`. Read is open to any signed-in
 * actor with access to the assistant (the fiche's own wording): the same
 * "any real account, not `public`" gate `/agent-skills` used to reserve for
 * `admin`, loosened here because *reading* what prompt a tool uses is not a
 * secret — the panel a non-admin editor sees (fiche 43's page-builder
 * "Générer" button, a later fiche) needs to be able to show the template it
 * is about to run. Write stays `admin`-only, same posture as every other
 * settings screen.
 */

export interface PromptTemplateSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly template: string
  readonly builtin: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PromptTemplateRegistryLike {
  list(): Promise<readonly PromptTemplateSummary[]>
  get(id: string): Promise<PromptTemplateSummary | undefined>
  create(input: {
    readonly name: string
    readonly description: string
    readonly category: string
    readonly template: string
  }): Promise<PromptTemplateSummary>
  update(
    id: string,
    patch: {
      readonly name?: string
      readonly description?: string
      readonly category?: string
      readonly template?: string
    },
  ): Promise<PromptTemplateSummary>
  remove(id: string): Promise<void>
}

export interface PromptTemplatesRouterOptions {
  readonly templates: PromptTemplateRegistryLike
  /** Mount point. `/api/prompt-templates` by default. */
  readonly basePath?: string
}

export interface PromptTemplatesRouter {
  handle(request: RestRequest, actor?: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/prompt-templates'

function requireSignedIn(actor: Actor): void {
  if (actor.id !== null) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Sign in to read the prompt template library.',
    hint: 'This route needs a real account, not an anonymous request.',
  })
}

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may manage prompt templates.',
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
    hint: 'Prompt template routes are /api/prompt-templates and /api/prompt-templates/:id.',
  })
}

function templateNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'PROMPT_TEMPLATE_UNKNOWN',
    message: `No prompt template with id "${id}".`,
    hint: 'Check the id against GET /api/prompt-templates.',
  })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'PROMPT_TEMPLATE_INVALID',
      message: 'The request body is not an object.',
      hint: 'Send a JSON object.',
    })
  }
  return body as Record<string, unknown>
}

function stringField(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field]
  return typeof value === 'string' ? value : undefined
}

export function createPromptTemplatesRouter(
  options: PromptTemplatesRouterOptions,
): PromptTemplatesRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor = ANONYMOUS) => {
      try {
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()
        const [id, extra] = segments

        // GET|POST /api/prompt-templates
        if (id === undefined) {
          if (method === 'GET') {
            requireSignedIn(actor)
            return jsonResponse(200, { data: await options.templates.list() })
          }
          if (method === 'POST') {
            requireAdmin(actor)
            const body = asRecord(request.body)
            const name = stringField(body, 'name')
            const description = stringField(body, 'description')
            const category = stringField(body, 'category')
            const template = stringField(body, 'template')
            if (
              name === undefined ||
              description === undefined ||
              category === undefined ||
              template === undefined
            ) {
              throw new CogentaError({
                code: 'PROMPT_TEMPLATE_INVALID',
                message:
                  'A prompt template needs "name", "description", "category" and "template".',
                hint: 'Send { "name": "…", "description": "…", "category": "…", "template": "…" }.',
              })
            }
            const created = await options.templates.create({
              name,
              description,
              category,
              template,
            })
            return jsonResponse(201, { data: created })
          }
          return methodNotAllowed(['GET', 'POST'])
        }

        if (extra !== undefined) throw noRoute()

        if (method === 'GET') {
          requireSignedIn(actor)
          const found = await options.templates.get(id)
          if (found === undefined) throw templateNotFound(id)
          return jsonResponse(200, { data: found })
        }

        if (method === 'PATCH' || method === 'PUT') {
          requireAdmin(actor)
          const body = asRecord(request.body)
          const name = stringField(body, 'name')
          const description = stringField(body, 'description')
          const category = stringField(body, 'category')
          const template = stringField(body, 'template')
          const updated = await options.templates.update(id, {
            ...(name === undefined ? {} : { name }),
            ...(description === undefined ? {} : { description }),
            ...(category === undefined ? {} : { category }),
            ...(template === undefined ? {} : { template }),
          })
          return jsonResponse(200, { data: updated })
        }

        if (method === 'DELETE') {
          requireAdmin(actor)
          await options.templates.remove(id)
          return jsonResponse(200, { data: { id, removed: true } })
        }

        return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
