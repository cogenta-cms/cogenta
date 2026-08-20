import { CogentaError } from '@cogenta/core'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `GET /api/tools`, `POST /api/tools/{id}/run`, `GET /api/tools/runs` and
 * `GET /api/tools/runs/{id}` — the "Outils" admin screen (fiche 24 task 3).
 *
 * A tool never runs inline in the HTTP request that triggers it: every one
 * of them goes through the queue (`run` enqueues and returns immediately),
 * because "un traitement long ne doit pas être une requête HTTP qui expire"
 * is a literal acceptance criterion. This router only ever hands back a run
 * id and lets the admin poll it — the queue driver, its degraded tier and
 * the actual tool bodies live in `cogenta serve` (the one caller that has
 * both a database and a content store to work with).
 */

export type ToolRunStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface ToolDefinitionLike {
  readonly id: string
  /** A translation key, not prose — the admin resolves it (ADR-0019). */
  readonly labelKey: string
  readonly reversible: boolean
  /** A translation key naming a rough duration bucket ("seconds", "minutes", …). */
  readonly estimatedDurationKey: string
}

export interface ToolRunLike {
  readonly id: string
  readonly tool: string
  readonly status: ToolRunStatus
  readonly startedAt: string
  readonly finishedAt: string | undefined
  /** Lines of progress, oldest first, already redacted by the caller. */
  readonly log: readonly string[]
  readonly error: string | undefined
}

export interface ToolsRouterOptions {
  readonly tools: readonly ToolDefinitionLike[]
  /** Starts a run, returns its id. Throws `MAINT_TOOL_UNKNOWN` for an unknown tool id. */
  readonly run: (
    toolId: string,
    options: { readonly external?: boolean; readonly email?: string },
  ) => Promise<string>
  readonly getRun: (id: string) => ToolRunLike | null
  /** Most recent first, bounded by the caller. */
  readonly listRuns: () => readonly ToolRunLike[]
  readonly basePath?: string
}

export interface ToolsRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/tools'

function forbidden(context: AccessContext, what: string): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: `Access denied: ${what} can only be used by the admin role.`,
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext, what: string): void {
  if (context.actor.roles.includes('admin')) return
  throw forbidden(context, what)
}

function unknownTool(id: string): CogentaError {
  return new CogentaError({
    code: 'MAINT_TOOL_UNKNOWN',
    message: `No maintenance tool "${id}".`,
    hint: 'Check the id against GET /api/tools.',
    details: { id },
  })
}

function unknownRun(id: string): CogentaError {
  return new CogentaError({
    code: 'MAINT_TOOL_RUN_NOT_FOUND',
    message: `No tool run "${id}".`,
    hint: 'Runs are kept in memory for the lifetime of the process — a run from before a restart no longer exists.',
    details: { id },
  })
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
    hint: 'The tools routes are GET /api/tools, POST /api/tools/{id}/run, GET /api/tools/runs and GET /api/tools/runs/{id}.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function createToolsRouter(options: ToolsRouterOptions): ToolsRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        return await route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function route(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const path = normalise(request.path.split('?')[0] ?? request.path)
    const method = request.method.toUpperCase()

    if (path === basePath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the maintenance tools')
      return jsonResponse(200, { data: { tools: options.tools } })
    }

    if (path === `${basePath}/runs`) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the tool run log')
      return jsonResponse(200, { data: { runs: options.listRuns() } })
    }

    const runsPrefix = `${basePath}/runs/`
    if (path.startsWith(runsPrefix) && path.length > runsPrefix.length) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'a tool run')
      const id = decodeURIComponent(path.slice(runsPrefix.length))
      const run = options.getRun(id)
      if (run === null) throw unknownRun(id)
      return jsonResponse(200, { data: run })
    }

    const runToolMatch = new RegExp(
      `^${basePath.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/([^/]+)/run$`,
      'u',
    ).exec(path)
    if (runToolMatch !== null) {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      assertAdmin(context, 'running a maintenance tool')
      const id = decodeURIComponent(runToolMatch[1] as string)
      if (!options.tools.some((tool) => tool.id === id)) throw unknownTool(id)
      const body = (request.body ?? {}) as { readonly external?: unknown; readonly email?: unknown }
      const runId = await options.run(id, {
        external: body.external === true,
        ...(typeof body.email === 'string' && body.email.length > 0 ? { email: body.email } : {}),
      })
      return jsonResponse(202, { data: { id: runId } })
    }

    throw noRoute()
  }
}
