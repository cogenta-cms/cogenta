import {
  CogentaError,
  type FetchPublicOptions,
  fetchPublicOnce,
  isCogentaError,
  type PinnedFetch,
  readBoundedText,
} from '@cogenta/core'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

const MAX_BODY_LENGTH = 100_000
/**
 * What is read off the wire before the text is cut to {@link MAX_BODY_LENGTH}
 * characters: four bytes per character is the most UTF-8 spends on one, so a
 * body of 100 000 characters always fits.
 */
const MAX_BODY_BYTES = MAX_BODY_LENGTH * 4
/** How long reading one body may take, from the first read. */
const BODY_TIMEOUT_MS = 30_000

export interface HttpFetchToolOptions {
  /** Exact hostnames this instance may reach — `http.fetch(domains[])` in the Contract C taxonomy is the permission this list backs. */
  readonly allowedDomains: readonly string[]
  /** Optional structural restriction to a site's own scheme, host and port. */
  readonly allowedOrigins?: readonly string[]
  /**
   * Replaces the transport entirely — **no address check, no pinning**. A test
   * seam: production code leaves it out, and then every request resolves the
   * host, refuses a loopback, private or link-local address and connects to
   * the address it checked. There is no switch to allow internal hosts.
   */
  readonly fetchImpl?: typeof fetch
  /** Overridable for tests — real `dns.lookup` by default. */
  readonly lookupImpl?: FetchPublicOptions['lookupImpl']
  /** Overridable for tests — the address-pinned transport by default. */
  readonly pinnedFetchImpl?: PinnedFetch
  /** Time allowed for reading one response body. Defaults to 30 seconds. */
  readonly bodyTimeoutMs?: number
}

const HttpFetchInputSchema = z.object({
  url: z.string(),
  method: z.enum(['GET', 'HEAD']).optional(),
})
export type HttpFetchInput = z.infer<typeof HttpFetchInputSchema>

const HttpFetchOutputSchema = z.object({
  status: z.number(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
})
export type HttpFetchOutput = z.infer<typeof HttpFetchOutputSchema>

/**
 * `http.fetch` — the domain allowlist is fixed at construction, one
 * instance per agent's granted domains (how a `defineAgent` config's
 * `http.fetch(domains: [...])` becomes this list is the runtime assembly's
 * job, not this tool's). Restricted to `GET`/`HEAD`: a generic tool that can
 * `POST` arbitrary bodies to arbitrary allowed hosts is a materially bigger
 * blast radius than one that can only read, and nothing in L4's scope so
 * far needs more than reading.
 */
export function createHttpFetchTool(
  options: HttpFetchToolOptions,
): ToolDefinition<HttpFetchInput, HttpFetchOutput> {
  const allowed = new Set(options.allowedDomains)
  const origins = options.allowedOrigins === undefined ? undefined : new Set(options.allowedOrigins)

  return defineTool({
    name: 'http.fetch',
    version: '1.0.0',
    description: 'Fetch a URL on an explicitly allowed domain (GET or HEAD only).',
    input: HttpFetchInputSchema,
    output: HttpFetchOutputSchema,
    permissions: ['http.fetch'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input, ctx) {
      const parsed = new URL(input.url)
      if (
        !allowed.has(parsed.hostname) ||
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username !== '' ||
        parsed.password !== '' ||
        (origins !== undefined && !origins.has(parsed.origin))
      ) {
        throw new CogentaError({
          code: 'HTTP_FETCH_DOMAIN_DENIED',
          message: !allowed.has(parsed.hostname)
            ? `"${parsed.hostname}" is not in this agent's allowed domain list.`
            : 'This URL is outside the site origins and HTTP protocols this tool may read.',
          hint: 'Grant the domain in the agent definition, or fetch a different URL.',
          details: { hostname: parsed.hostname, allowed: [...allowed] },
        })
      }

      // Never let an allowed page redirect this client to an ungranted host.
      // A redirect is returned as data for the auditor to report or follow
      // through a new, independently checked call.
      const method = input.method ?? 'GET'
      let response: Response
      if (options.fetchImpl !== undefined) {
        response = await options.fetchImpl(parsed, {
          method,
          signal: ctx.signal,
          redirect: 'manual',
        })
      } else {
        try {
          // An allowed *name* is not an allowed *address*: the host is
          // resolved, judged public, and the connection is made to that very
          // address (pentest 2026-11-01, C-04).
          response = await fetchPublicOnce(parsed.toString(), {
            method,
            signal: ctx.signal,
            ...(options.lookupImpl === undefined ? {} : { lookupImpl: options.lookupImpl }),
            ...(options.pinnedFetchImpl === undefined
              ? {}
              : { pinnedFetch: options.pinnedFetchImpl }),
          })
        } catch (error) {
          if (isCogentaError(error) && error.code === 'HTTP_TARGET_UNSAFE') {
            throw new CogentaError({
              code: 'HTTP_FETCH_DOMAIN_DENIED',
              message: `"${parsed.hostname}" resolves to an address this tool will not reach.`,
              hint: 'Only public addresses are fetched; loopback, private and link-local ranges are refused.',
              details: { hostname: parsed.hostname },
              cause: error,
            })
          }
          throw error
        }
      }
      // Read as a stream and stopped at the limit: `response.text()` first and
      // truncating after would have held the whole body in memory (pentest
      // 2026-11-01, C-03). The cap is a prefix, as it always was.
      const read = await readBoundedText(response, {
        maxBytes: MAX_BODY_BYTES,
        onLimit: 'truncate',
        timeoutMs: options.bodyTimeoutMs ?? BODY_TIMEOUT_MS,
        signal: ctx.signal,
      })
      const text = read.text
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      return {
        status: response.status,
        headers,
        body:
          read.truncated || text.length > MAX_BODY_LENGTH
            ? `${text.slice(0, MAX_BODY_LENGTH)}…`
            : text,
      }
    },
  })
}
