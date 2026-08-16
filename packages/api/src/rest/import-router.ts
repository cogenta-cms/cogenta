import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/import/wordpress` — the admin's counterpart to `cogenta import
 * wordpress` on a terminal.
 *
 * The import logic is not duplicated here: `runWordPressImport` is injected,
 * the same shape rule `MediaRouterOptions.images` already follows for the
 * same reason — `@cogenta/import`'s real `importWordPress` (real database
 * writes, real media downloads through the site's own storage driver) is
 * called unchanged, and this package never gains a dependency on it. The
 * caller (`@cogenta/cli`'s `assembleSite`) is what closes over the site's
 * `db` and `storage`.
 *
 * Admin-only, checked before anything else — an import writes content,
 * media, redirects and even auth users (one per WordPress author), so it
 * gets the same door as everything else that changes the shape of a site.
 */

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

export interface ImportRouterOptions {
  /** Runs the real WordPress importer against this site's database and storage. */
  runWordPressImport(xml: string): Promise<ImportReportLike>
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
 * WXR document to ~30 MB — comfortably past a real WordPress export, and
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
    hint: 'Import routes are /api/import/wordpress.',
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
      hint: 'WordPress can split a large export into several files from Tools → Export — import them one at a time.',
      details: { filename: record.filename },
    })
  }
  return { filename: record.filename, data: record.data }
}

function decodeXml(filename: string, base64: string): string {
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

export function createImportRouter(options: ImportRouterOptions): ImportRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)

        const segments = segmentsOf(request.path, basePath)
        if (segments === null || segments.length !== 1 || segments[0] !== 'wordpress') {
          throw noRoute()
        }
        if (request.method.toUpperCase() !== 'POST') return methodNotAllowed(['POST'])

        const { filename, data } = requireUpload(request.body)
        const xml = decodeXml(filename, data)
        const report = await options.runWordPressImport(xml)
        return jsonResponse(200, { data: report })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
