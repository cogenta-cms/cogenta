import { CogentaError } from '@cogenta/core'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

const MAX_BODY_LENGTH = 100_000

export interface HttpFetchToolOptions {
  /** Exact hostnames this instance may reach — `http.fetch(domains[])` in the Contract C taxonomy is the permission this list backs. */
  readonly allowedDomains: readonly string[]
  /** Optional structural restriction to a site's own scheme, host and port. */
  readonly allowedOrigins?: readonly string[]
  readonly fetchImpl?: typeof fetch
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
  const doFetch = options.fetchImpl ?? fetch
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

      const response = await doFetch(parsed, {
        method: input.method ?? 'GET',
        signal: ctx.signal,
        // Never let an allowed page redirect this client to an ungranted host.
        // A redirect is returned as data for the auditor to report or follow
        // through a new, independently checked call.
        redirect: 'manual',
      })
      const text = await response.text()
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      return {
        status: response.status,
        headers,
        body: text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH)}…` : text,
      }
    },
  })
}
