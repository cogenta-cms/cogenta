import { CogentaError } from '@cogenta/core'
import type { ContentApiConfig } from '../config.js'
import type { ContentClient, ContentEntry, Page, QueryRequest } from './types.js'

/**
 * The content client of contract D, and it is HTTP on purpose (ADR-0016).
 *
 * It holds one credential — a read-only token carrying the rights of the
 * `public` role — and it speaks to `@cogenta/api` over the network. It imports
 * neither `@cogenta/schema` nor a database driver, and it could not use one:
 * there is no connection in this process to use.
 *
 * A theme therefore cannot reach a draft even by asking for one. The refusal
 * happens in the permission layer on the other side of the wire, where it can
 * be enforced rather than promised.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ContentClientOptions extends ContentApiConfig {
  /** Locale sent when a request does not name one. */
  readonly locale?: string | undefined
  /** Injected in tests and by hosts with their own instrumentation. */
  readonly fetch?: FetchLike | undefined
  /** Milliseconds before a request is abandoned. A slow API must not hang a build. */
  readonly timeoutMs?: number | undefined
}

const DEFAULT_BASE_PATH = '/api/content'
const DEFAULT_TIMEOUT_MS = 10_000

interface Envelope<T> {
  readonly data: T
  readonly page?: { readonly hasMore: boolean; readonly nextCursor: string | null }
}

export function createContentClient(options: ContentClientOptions): ContentClient {
  const basePath = (options.basePath ?? DEFAULT_BASE_PATH).replace(/\/+$/u, '')
  const origin = options.url.replace(/\/+$/u, '')
  const doFetch = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function request(path: string, query: Readonly<Record<string, string>>): Promise<unknown> {
    const url = new URL(`${origin}${basePath}${path}`)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

    const signal = AbortSignal.timeout(timeoutMs)
    let response: Response
    try {
      response = await doFetch(url.toString(), {
        method: 'GET',
        signal,
        headers: {
          accept: 'application/json',
          // The one credential of the delivery plane. Never logged, never put
          // in an error, never handed to a theme (rule R7).
          authorization: `Bearer ${options.token}`,
        },
      })
    } catch (error) {
      throw new CogentaError({
        code: 'CONTENT_API_FAILED',
        message: `The content API could not be reached at ${url.pathname}.`,
        hint: 'Check that the API is running and that content.url points at it. The renderer reads content over HTTP and has no other way in (ADR-0016).',
        cause: error,
        details: { path: url.pathname },
      })
    }

    if (response.status === 404) return null
    if (!response.ok) throw await failure(response, url)

    try {
      return await response.json()
    } catch (error) {
      throw new CogentaError({
        code: 'CONTENT_API_FAILED',
        message: `The content API returned a body that is not JSON for ${url.pathname}.`,
        hint: 'Check that content.url points at the Cogenta API and not at a proxy or an error page.',
        cause: error,
        details: { path: url.pathname, status: response.status },
      })
    }
  }

  async function failure(response: Response, url: URL): Promise<CogentaError> {
    const body: unknown = await response
      .text()
      .then(parseJson)
      .catch(() => undefined)
    const api = errorFrom(body)
    const forbidden = response.status === 401 || response.status === 403

    return new CogentaError({
      code: 'CONTENT_API_FAILED',
      message: `The content API refused ${url.pathname} with ${response.status}${api === undefined ? '' : `: ${api}`}.`,
      hint: forbidden
        ? 'The render token carries the rights of the `public` role only. A theme never sees a draft, by design — ask for published content, or render this page through a preview token.'
        : 'Check the request the theme made against the query vocabulary of the content API.',
      details: { path: url.pathname, status: response.status },
    })
  }

  function entryFrom(payload: unknown): ContentEntry | null {
    if (payload === null) return null
    const envelope = payload as Envelope<ContentEntry | null>
    return envelope.data ?? null
  }

  return {
    entry: async (collection, id) =>
      entryFrom(await request(`/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {})),

    // Path resolution is a route lookup, not an entry lookup: the renderer
    // knows a URL and nothing else. The API exposes it beside the collection
    // routes, under a segment no collection can be named.
    byPath: async (path) => entryFrom(await request('/-/by-path', { path })),

    list: async (query: QueryRequest): Promise<Page<ContentEntry>> => {
      const payload = await request(`/${encodeURIComponent(query.collection)}`, listQuery(query))
      const envelope = payload as Envelope<readonly ContentEntry[]> | null
      if (envelope === null || !Array.isArray(envelope.data)) {
        return { items: [], nextCursor: null, hasMore: false }
      }
      return {
        items: envelope.data,
        nextCursor: envelope.page?.nextCursor ?? null,
        hasMore: envelope.page?.hasMore ?? false,
      }
    },
  }

  function listQuery(query: QueryRequest): Record<string, string> {
    const parameters: Record<string, string> = {}
    const locale = query.locale ?? options.locale
    if (locale !== undefined) parameters.locale = locale
    if (query.filter !== undefined) parameters.filter = JSON.stringify(query.filter)
    if (query.sort !== undefined && query.sort.length > 0) {
      parameters.sort = query.sort
        .map((entry) => (entry.direction === 'desc' ? `-${entry.field}` : entry.field))
        .join(',')
    }
    if (query.after !== undefined) parameters.after = query.after
    if (query.limit !== undefined) parameters.limit = String(query.limit)
    if (query.depth !== undefined) parameters.depth = String(query.depth)
    return parameters
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function errorFrom(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return undefined
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : undefined
}
