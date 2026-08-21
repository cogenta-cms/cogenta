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

/** Structural mirror of `@cogenta/agents`' `AssistUsageSnapshot` (fiche 30 task 3). */
export interface AssistUsageSnapshotLike {
  readonly tokensThisMonth: number
  readonly limit?: number
  readonly percentUsed?: number
  readonly nearLimit: boolean
  readonly overLimit: boolean
  readonly byTool: readonly {
    readonly tool: string
    readonly calls: number
    readonly tokens: number
  }[]
}

/** Structural mirror of `@cogenta/agents`' `AssistUsageTracker`. */
export interface AssistUsageTrackerLike {
  checkBudget(): { readonly allowed: boolean }
  usage(): AssistUsageSnapshotLike
}

export interface AssistToolsetLike {
  readonly available: boolean
  readonly reason?: string
  readonly tools: readonly AssistToolLike[]
  readonly capabilities: readonly AssistCapabilityLike[]
  /** The text model in use, when a provider is configured — fed to the admin so a `provenanceDetail.model` can be recorded on save. */
  readonly model?: string
  /** Absent when no provider is configured — there is nothing to meter (R2). */
  readonly usage?: AssistUsageTrackerLike
}

/** One collection's place in the vector index. Structural mirror of `@cogenta/cli`'s `AssistantIndexedCollection` (L22 task 4). */
export interface AssistIndexedCollectionLike {
  readonly name: string
  readonly enabled: boolean
  readonly count: number
}

/** Structural mirror of `@cogenta/cli`'s `AssistantVectorInfo` (fiche 30 task 6, widened by L22 task 4), minus `noteIndexed` — a read-only view is all this route needs. */
export interface AssistVectorInfoLike {
  readonly driver: string
  readonly dimensions: number
  count(): Promise<number>
  lastIndexedAt(): string | null
  collections(): Promise<readonly AssistIndexedCollectionLike[]>
  readonly referenceCollection: string
}

/** Structural mirror of `@cogenta/agents`' `ReferenceDocumentRecord` (L22 task 4). */
export interface AssistDocumentRecordLike {
  readonly id: string
  readonly filename: string
  readonly format: string
  readonly characters: number
  readonly chunkCount: number
  readonly status: 'pending' | 'indexed' | 'error'
  readonly errorMessage: string | null
  readonly warnings: readonly string[]
  readonly uploadedAt: string
  readonly uploadedBy: string | null
  readonly indexedAt: string | null
}

/** Structural mirror of `@cogenta/cli`'s `AssistantDocumentService` (L22 task 4) — the document upload flow, wired onto the existing extraction/chunking/embedding pipeline. */
export interface AssistDocumentServiceLike {
  list(): Promise<readonly AssistDocumentRecordLike[]>
  upload(input: {
    readonly filename: string
    readonly bytes: Buffer
    readonly uploadedBy: string | null
  }): Promise<AssistDocumentRecordLike>
  remove(id: string): Promise<void>
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
  /** Absent when the site has no vector store — fiche 30 task 6's "l'index vectoriel est invisible". */
  readonly vectorInfo?: AssistVectorInfoLike
  /** Absent under the same condition as `vectorInfo` — L22 task 4's document upload flow. */
  readonly documents?: AssistDocumentServiceLike
}

export interface AssistantRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/assistant'
const DEFAULT_TIMEOUT_MS = 60_000
/** Base64 of `@cogenta/agents`' `MAX_DOCUMENT_BYTES` (20 MiB), inflated by roughly a third — the same margin `site-plan-router.ts`'s `MAX_BASE64_PER_DOCUMENT` uses. */
const MAX_BASE64_LENGTH = 28 * 1024 * 1024

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

  /** Managing the shared reference-document index is an admin action, like every `assistant.*` site setting (fiche 23, ADR-0025) — an editor may *use* the assistant without being able to change what it can cite to everyone else. */
  function assertMayManageDocuments(context: AccessContext): void {
    if (context.actor.roles.includes('admin')) return
    throw new CogentaError({
      code: context.actor.id === null ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      message: 'Only the admin role may manage the assistant’s reference documents.',
      hint: 'These documents feed every user’s assistant answers — ask an administrator to add or remove one.',
    })
  }

  async function capabilities(): Promise<RestResponse> {
    // 200, always. "No provider configured" is an answer, not a failure — the
    // whole degradation story of this lot depends on this not being an error.
    const vector =
      options.vectorInfo === undefined
        ? undefined
        : {
            driver: options.vectorInfo.driver,
            dimensions: options.vectorInfo.dimensions,
            count: await options.vectorInfo.count(),
            lastIndexedAt: options.vectorInfo.lastIndexedAt(),
            collections: await options.vectorInfo.collections(),
            referenceCollection: options.vectorInfo.referenceCollection,
          }

    return jsonResponse(200, {
      data: {
        available: options.toolset.available,
        ...(options.toolset.reason === undefined ? {} : { reason: options.toolset.reason }),
        tools: options.toolset.capabilities,
        ...(options.toolset.model === undefined ? {} : { model: options.toolset.model }),
        ...(options.toolset.usage === undefined ? {} : { usage: options.toolset.usage.usage() }),
        ...(vector === undefined ? {} : { vector }),
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

    // Checked before the tool is even resolved: a site over its monthly cap
    // refuses cleanly rather than spending one more token to find out which
    // tool was asked for (fiche 30 task 3 — "un plafond qui refuse est
    // indispensable").
    if (options.toolset.usage !== undefined && !options.toolset.usage.checkBudget().allowed) {
      throw new CogentaError({
        code: 'ASSIST_BUDGET_EXCEEDED',
        message: "This site's monthly assistant budget has been reached.",
        hint: 'Everything else works as usual. Raise assistant.monthlyTokenLimit, or wait for next month.',
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

  const documentsPath = `${basePath}/documents`

  function noDocumentService(): CogentaError {
    return new CogentaError({
      code: 'ASSIST_UNAVAILABLE',
      message: 'This site has no vector store, so there is nowhere to index a reference document.',
      hint: 'Configure an embeddings provider (and, optionally, a vector driver) in cogenta.config.mjs.',
    })
  }

  async function listDocuments(): Promise<RestResponse> {
    if (options.documents === undefined) throw noDocumentService()
    return jsonResponse(200, { data: await options.documents.list() })
  }

  async function uploadDocument(
    request: RestRequest,
    context: AccessContext,
  ): Promise<RestResponse> {
    if (options.documents === undefined) throw noDocumentService()
    const body = request.body
    if (typeof body !== 'object' || body === null) {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: 'The request body must be a JSON object.',
        hint: 'Send { "filename": "handbook.pdf", "contentBase64": "…" }.',
      })
    }
    const { filename, contentBase64 } = body as { filename?: unknown; contentBase64?: unknown }
    if (typeof filename !== 'string' || filename === '') {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: 'This upload has no filename.',
        hint: 'Send { "filename": "handbook.pdf", "contentBase64": "…" }.',
      })
    }
    if (typeof contentBase64 !== 'string' || contentBase64 === '') {
      throw new CogentaError({
        code: 'CONTENT_INVALID',
        message: `"${filename}" carries no content.`,
        hint: 'Send the file base64-encoded in "contentBase64".',
      })
    }
    // Base64 grows bytes by roughly a third — checked on the encoded string,
    // before anything decodes it, the same guard `site-plan-router.ts` uses
    // for the same reason: this route invites megabyte bodies by design, and
    // the far side's own `MAX_DOCUMENT_BYTES` (20 MiB) only fires after a
    // Buffer that size has already been allocated.
    if (contentBase64.length > MAX_BASE64_LENGTH) {
      throw new CogentaError({
        code: 'DOCUMENT_TOO_LARGE',
        message: `"${filename}" is larger than this route accepts.`,
        hint: 'Upload a document of 20 MB or less.',
        details: { filename },
      })
    }
    const created = await options.documents.upload({
      filename,
      bytes: Buffer.from(contentBase64, 'base64'),
      uploadedBy: context.actor.id,
    })
    logger.info('reference document uploaded', {
      filename: created.filename,
      status: created.status,
      actorId: context.actor.id,
    })
    return jsonResponse(201, { data: created })
  }

  async function removeDocument(id: string): Promise<RestResponse> {
    if (options.documents === undefined) throw noDocumentService()
    await options.documents.remove(id)
    return jsonResponse(200, { data: { id, deleted: true } })
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

        if (path === documentsPath) {
          if (method === 'GET') {
            assertMayUseAssistant(context)
            return await listDocuments()
          }
          if (method === 'POST') {
            assertMayManageDocuments(context)
            return await uploadDocument(request, context)
          }
          return methodNotAllowed(['GET', 'POST'])
        }

        if (path.startsWith(`${documentsPath}/`)) {
          const id = path.slice(documentsPath.length + 1)
          if (id.length === 0 || id.includes('/')) {
            throw new CogentaError({
              code: 'CONTENT_NOT_FOUND',
              message: 'No route matches this path.',
              hint: 'A document route is /api/assistant/documents/:id.',
            })
          }
          if (method !== 'DELETE') return methodNotAllowed(['DELETE'])
          assertMayManageDocuments(context)
          return await removeDocument(id)
        }

        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: 'No route matches this path.',
          hint: 'The assistant routes are GET /api/assistant, POST /api/assistant/run and /api/assistant/documents.',
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
