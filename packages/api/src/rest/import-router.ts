import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/import` — the admin's counterpart to `cogenta import wordpress` on a
 * terminal, extended (fiche 25) into a real preview/apply/status/undo flow
 * for four sources: WordPress WXR, CSV, a Cogenta JSON export, and RSS/Atom.
 *
 * The import logic is not duplicated here: every real step —
 * `analyzeWordPress`/`importWordPress`, `parseCsv`/`applyGeneric`,
 * `parseJsonImport`/`applyJson`, `feedToRecords`/`applyGeneric`,
 * `undoImport` — lives in `@cogenta/import` and is injected, the same shape
 * rule `MediaRouterOptions.images` already follows for the same reason: this
 * package never gains a dependency on it, and the caller (`@cogenta/cli`'s
 * `assembleSite`) is what closes over the site's `db`, `storage` and
 * collections.
 *
 * **Two phases, never one.** `POST /analyze` reads the uploaded file and
 * writes nothing; it returns a `runId` and a preview report. `POST
 * /runs/:id/apply` is the only route that writes, and it is safe to call
 * again on the same `runId` — a resumed apply after an interruption skips
 * what it already recorded rather than duplicating it (fiche 25 task 3).
 * `POST /runs/:id/cancel` trashes everything that run created (task 4); it
 * never calls `purge`, so an over-eager cancel is itself reversible from the
 * corbeille.
 *
 * Admin-only, checked before anything else — an import writes content,
 * media, redirects and even auth users, so it gets the same door as
 * everything else that changes the shape of a site.
 */

export const IMPORT_SOURCES = ['wordpress', 'csv', 'json', 'rss'] as const
export type ImportSourceLike = (typeof IMPORT_SOURCES)[number]

export interface ImportSkippedItemLike {
  readonly type: string
  readonly wpId: string
  readonly title: string
  readonly reason: string
}

export interface ImportUnconvertedBlockLike {
  readonly source: string
  readonly reason: string
  readonly postTitle: string
}

/** Structurally `@cogenta/import`'s `ConversionReport` — copied rather than imported, for the same reason the shape above is. */
export interface ImportReportLike {
  readonly imported: {
    readonly posts: number
    readonly pages: number
    readonly categories: number
    readonly tags: number
    readonly media: number
    readonly authors: number
    readonly comments: number
  }
  readonly redirectsCreated: number
  readonly skipped: readonly ImportSkippedItemLike[]
  readonly unconvertedBlocks: readonly ImportUnconvertedBlockLike[]
  readonly warnings: readonly string[]
}

/** Structurally `@cogenta/import`'s `ImportRun` — the run record a client polls. */
export interface ImportRunLike {
  readonly id: string
  readonly source: string
  readonly status: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly analysis: unknown
  readonly mapping: unknown
  readonly progress: { readonly processed: number; readonly total: number }
  readonly report: unknown
  readonly error: string | null
}

export interface ImportRouterOptions {
  /** Runs the real WordPress importer against this site's database and storage, one-shot (legacy route, still supported). */
  runWordPressImport(xml: string): Promise<ImportReportLike>
  /** Analyzes an uploaded file of the given source, without writing anything. */
  readonly analyze?: (input: {
    readonly source: ImportSourceLike
    readonly text: string
    readonly createdBy: string | null
    /** CSV/RSS only: which collection to propose a field mapping against. Ignored by WordPress and JSON, whose targets are not a single caller choice. */
    readonly targetCollection?: string
  }) => Promise<ImportRunLike>
  /** Applies a previously analyzed run — resumable, safe to call again on the same id. */
  readonly apply?: (input: {
    readonly runId: string
    readonly mapping?: unknown
  }) => Promise<ImportRunLike>
  readonly getRun?: (runId: string) => Promise<ImportRunLike | null>
  readonly listRuns?: () => Promise<readonly ImportRunLike[]>
  /** Trashes everything a run created. */
  readonly cancel?: (runId: string) => Promise<ImportRunLike>
  /** Mount point. `/api/import` by default. */
  readonly basePath?: string
}

export interface ImportRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/import'

/**
 * Base64 grows bytes by roughly a third (the same accounting
 * `site-plan-router.ts` uses for its own uploads), so this bounds the decoded
 * document to ~30 MB — comfortably past a real WordPress export, and
 * checked on the string itself, before anything decodes it.
 */
const MAX_BASE64_CHARS = 40 * 1024 * 1024

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may import content.',
    hint: 'Ask someone with the admin role to run this import.',
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

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'Import routes are /api/import/wordpress, /api/import/analyze, /api/import/runs and /api/import/runs/{id}/apply|cancel.',
  })
}

function notAvailable(feature: string): CogentaError {
  return new CogentaError({
    code: 'IMPORT_SOURCE_INVALID',
    message: `This server was not started with ${feature} wired in.`,
    hint: 'This is a caller configuration gap, not something the request can fix.',
  })
}

function requireUpload(body: unknown): { readonly filename: string; readonly data: string } {
  const record = body as { filename?: unknown; data?: unknown } | undefined
  if (typeof record?.filename !== 'string' || record.filename.trim().length === 0) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: 'This request names no file.',
      hint: 'Send { "filename": "export.xml", "data": "<base64>" }.',
    })
  }
  if (typeof record.data !== 'string' || record.data.length === 0) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: `File "${record.filename}" carries no content.`,
      hint: 'Send the file base64-encoded in "data".',
    })
  }
  if (record.data.length > MAX_BASE64_CHARS) {
    throw new CogentaError({
      code: 'DOCUMENT_TOO_LARGE',
      message: `"${record.filename}" is larger than this route accepts.`,
      hint: 'Split a large export into several files and import them one at a time.',
      details: { filename: record.filename },
    })
  }
  return { filename: record.filename, data: record.data }
}

function decodeText(filename: string, base64: string): string {
  const buffer = Buffer.from(base64, 'base64')
  // A non-base64 string decodes to *something* rather than throwing (the
  // same round-trip check `media-router.ts` uses), so length is the only
  // reliable signal.
  if (buffer.length === 0 && base64.trim().length > 0) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: `"${filename}" is not valid base64.`,
      hint: 'Encode the file contents as base64 before sending them.',
      details: { filename },
    })
  }
  return buffer.toString('utf8')
}

function isImportSource(value: unknown): value is ImportSourceLike {
  return typeof value === 'string' && (IMPORT_SOURCES as readonly string[]).includes(value)
}

export function createImportRouter(options: ImportRouterOptions): ImportRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  async function handleAnalyze(request: RestRequest, actor: Actor): Promise<RestResponse> {
    if (request.method.toUpperCase() !== 'POST') return methodNotAllowed(['POST'])
    if (options.analyze === undefined) throw notAvailable('preview/apply')

    const body = request.body as { source?: unknown; targetCollection?: unknown } | undefined
    if (!isImportSource(body?.source)) {
      throw new CogentaError({
        code: 'IMPORT_SOURCE_INVALID',
        message: 'This request names no valid import source.',
        hint: `Set "source" to one of: ${IMPORT_SOURCES.join(', ')}.`,
      })
    }
    const { filename, data } = requireUpload(request.body)
    const text = decodeText(filename, data)
    const run = await options.analyze({
      source: body.source,
      text,
      createdBy: actor.id,
      ...(typeof body.targetCollection === 'string'
        ? { targetCollection: body.targetCollection }
        : {}),
    })
    return jsonResponse(200, { data: run })
  }

  async function handleListRuns(request: RestRequest): Promise<RestResponse> {
    if (request.method.toUpperCase() !== 'GET') return methodNotAllowed(['GET'])
    if (options.listRuns === undefined) throw notAvailable('preview/apply')
    const runs = await options.listRuns()
    return jsonResponse(200, { data: runs })
  }

  async function handleRun(
    request: RestRequest,
    runId: string,
    action: string | undefined,
  ): Promise<RestResponse> {
    if (action === undefined) {
      if (request.method.toUpperCase() !== 'GET') return methodNotAllowed(['GET'])
      if (options.getRun === undefined) throw notAvailable('preview/apply')
      const run = await options.getRun(runId)
      if (run === null) {
        throw new CogentaError({
          code: 'IMPORT_RUN_NOT_FOUND',
          message: `No import run "${runId}" exists.`,
          hint: 'Analyze a source first — the response names the runId to apply, poll or cancel.',
          details: { id: runId },
        })
      }
      return jsonResponse(200, { data: run })
    }

    if (request.method.toUpperCase() !== 'POST') return methodNotAllowed(['POST'])

    if (action === 'apply') {
      if (options.apply === undefined) throw notAvailable('preview/apply')
      const body = request.body as { mapping?: unknown } | undefined
      const run = await options.apply({
        runId,
        ...(body?.mapping === undefined ? {} : { mapping: body.mapping }),
      })
      return jsonResponse(200, { data: run })
    }
    if (action === 'cancel') {
      if (options.cancel === undefined) throw notAvailable('undo')
      const run = await options.cancel(runId)
      return jsonResponse(200, { data: run })
    }
    throw noRoute()
  }

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)

        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()

        // Legacy one-shot route, unchanged.
        if (segments.length === 1 && segments[0] === 'wordpress') {
          if (request.method.toUpperCase() !== 'POST') return methodNotAllowed(['POST'])
          const { filename, data } = requireUpload(request.body)
          const xml = decodeText(filename, data)
          const report = await options.runWordPressImport(xml)
          return jsonResponse(200, { data: report })
        }

        // Awaited, not merely returned: a rejection from any of these must
        // land in this function's own `catch` below, not escape as an
        // unhandled rejection past a `return somePromise` that nothing here
        // ever awaits.
        if (segments.length === 1 && segments[0] === 'analyze')
          return await handleAnalyze(request, actor)
        if (segments.length === 1 && segments[0] === 'runs') return await handleListRuns(request)
        if (segments.length === 2 && segments[0] === 'runs') {
          return await handleRun(request, segments[1] as string, undefined)
        }
        if (segments.length === 3 && segments[0] === 'runs') {
          return await handleRun(request, segments[1] as string, segments[2])
        }

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
