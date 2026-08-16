import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import type { AccessContext, PermissionLayer } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/assistant` — L18 task 3's server half.
 *
 * Two routes, and the split matters:
 *
 * - `GET /api/assistant` answers **200 with `{available: false, tools: []}`** on
 *   a site with no AI provider. Not a 404, not a 501, not an error the admin has
 *   to catch: the admin panel asks once and renders nothing when the answer is
 *   `false`, which is the lot's "la fonctionnalité disparaît de l'UI plutôt que
 *   d'échouer bruyamment" made concrete (R2).
 * - `POST /api/assistant/run` executes one tool and returns its suggestion.
 *
 * Structural typing against `@cogenta/agents` rather than an import, exactly as
 * `agents-router.ts` does and for the same reason: `@cogenta/api` must not gain
 * a hard dependency on the agent runtime to describe four method signatures,
 * and the dependency arrow points one way.
 *
 * **The permission gate is here, not in the tools** (R4). Every assistant tool
 * reads or paraphrases content, so the rule is: an actor may use the assistant
 * only if they may write drafts in at least one collection. An anonymous caller
 * is refused before any provider is contacted, which also means an unauthenticated
 * request can never spend the site's API budget.
 */

export interface AssistToolLike {
  readonly name: string
  readonly description: string
  readonly sideEffects: boolean
  /** Zod schema; only `safeParse` is used here. */
  readonly input: {
    safeParse(value: unknown): { success: boolean; data?: unknown; error?: unknown }
  }
  execute(input: unknown, context: AssistToolContextLike): Promise<unknown>
}

export interface AssistToolContextLike {
  readonly site: {
    readonly name: string
    readonly url?: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  readonly actor: { readonly id: string | null; readonly roles: readonly string[] }
  readonly logger: {
    info(message: string, fields?: Readonly<Record<string, unknown>>): void
    warn(message: string, fields?: Readonly<Record<string, unknown>>): void
    error(message: string, fields?: Readonly<Record<string, unknown>>): void
  }
  readonly signal: AbortSignal
}

export interface AssistCapabilityLike {
  readonly tool: string
  readonly label: string
  readonly description: string
  readonly cost: string
  readonly needs: readonly string[]
}

export interface AssistToolsetLike {
  readonly available: boolean
  readonly reason?: string
  readonly tools: readonly AssistToolLike[]
  readonly capabilities: readonly AssistCapabilityLike[]
}

export interface AssistantRouterOptions {
  readonly toolset: AssistToolsetLike
  /** Used to answer "may this actor use the assistant at all?". */
  readonly collections: readonly CollectionDefinition[]
  readonly permissions: PermissionLayer
  readonly site: AssistToolContextLike['site']
  readonly logger?: AssistToolContextLike['logger']
  /** Mount point. `/api/assistant` by default. */
  readonly basePath?: string
  /** How long one suggestion may take before it is cancelled. */
  readonly timeoutMs?: number
}

export interface AssistantRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/assistant'
const DEFAULT_TIMEOUT_MS = 60_000

const SILENT_LOGGER: AssistToolContextLike['logger'] = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
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

export function createAssistantRouter(options: AssistantRouterOptions): AssistantRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const logger = options.logger ?? SILENT_LOGGER
  const byName = new Map(options.toolset.tools.map((tool) => [tool.name, tool]))

  /**
   * The one gate. An actor may ask the assistant for a suggestion when they may
   * create or edit a draft somewhere — the assistant exists to help with an
   * edit, and someone who cannot edit has nothing to do with it.
   */
  function assertMayUseAssistant(context: AccessContext): void {
    const writable = options.collections.some(
      (collection) => options.permissions.can('update', collection, context).allowed,
    )
    if (writable) return

    throw new CogentaError({
      code: context.actor.id === null ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      message: 'Only someone who can edit content may use the writing assistant.',
      hint: 'Sign in with a role that may create or edit drafts.',
    })
  }

  function capabilities(): RestResponse {
    // 200, always. "No provider configured" is an answer, not a failure — the
    // whole degradation story of this lot depends on this not being an error.
    return jsonResponse(200, {
      data: {
        available: options.toolset.available,
        ...(options.toolset.reason === undefined ? {} : { reason: options.toolset.reason }),
        tools: options.toolset.capabilities,
      },
    })
  }

  async function run(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    assertMayUseAssistant(context)

    if (!options.toolset.available) {
      throw new CogentaError({
        code: 'ASSIST_UNAVAILABLE',
        message: 'No AI provider is configured for this site.',
        hint: 'Everything else works as usual. Configure an AI provider to switch the assistant on.',
      })
    }

    const body = request.body
    if (typeof body !== 'object' || body === null) {
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: 'The request body must be a JSON object.',
        hint: 'Send {"tool": "assist.rewrite", "input": {…}}.',
      })
    }

    const { tool: name, input } = body as { tool?: unknown; input?: unknown }
    if (typeof name !== 'string') {
      throw new CogentaError({
        code: 'QUERY_INVALID',
        message: 'The request body has no "tool" name.',
        hint: 'Name one of the tools GET /api/assistant lists.',
      })
    }

    const tool = byName.get(name)
    if (tool === undefined) {
      throw new CogentaError({
        code: 'TOOL_UNKNOWN',
        message: `No assistant tool named "${name}" is available on this site.`,
        hint: 'Check the name against GET /api/assistant.',
      })
    }

    // Belt and braces: the assistant toolset declares no side effect anywhere,
    // and this route refuses to run one even if a future tool did. A route that
    // can only run read-only tools cannot become a write path by accident (R6).
    if (tool.sideEffects) {
      throw new CogentaError({
        code: 'TOOL_CALL_REJECTED',
        message: `"${name}" changes something, and the assistant route only runs tools that do not.`,
        hint: 'A change to the site goes through the content API, where a human confirms it.',
      })
    }

    const parsed = tool.input.safeParse(input ?? {})
    if (!parsed.success) {
      throw new CogentaError({
        code: 'TOOL_INPUT_INVALID',
        message: `The input for "${name}" did not match what it expects.`,
        hint: 'Check the fields this tool needs against GET /api/assistant.',
      })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    try {
      const output = await tool.execute(parsed.data, {
        site: options.site,
        actor: context.actor,
        logger,
        signal: controller.signal,
      })
      logger.info('assistant suggestion produced', { tool: name, actorId: context.actor.id })
      return jsonResponse(200, { data: output })
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        const path = normalise(request.path.split('?')[0] ?? request.path)
        const method = request.method.toUpperCase()

        if (path === basePath) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          // Capabilities are readable by anyone who may edit; an anonymous
          // caller gets the same refusal as on `run`, so the panel never renders
          // for someone who could not use it anyway.
          assertMayUseAssistant(context)
          return capabilities()
        }

        if (path === `${basePath}/run`) {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          return await run(request, context)
        }

        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: 'No route matches this path.',
          hint: 'The assistant routes are GET /api/assistant and POST /api/assistant/run.',
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
