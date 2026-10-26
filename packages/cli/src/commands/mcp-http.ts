import type { IncomingMessage, ServerResponse } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import type { AccessContext } from '@cogenta/api'
import type { ApiKeyStore } from '@cogenta/auth'
import { createMcpHttpHandler, createMcpServer, type McpHttpRequestRecord } from '@cogenta/mcp'
import {
  apiKeyIdentityResolver,
  createMcpToolSource,
  type McpSiteToolsOptions,
  mcpServerInstructions,
} from './mcp-tools.js'

/**
 * `/api/mcp` on `cogenta serve` — MCP's Streamable HTTP transport, so Claude
 * Code, Claude Desktop or any MCP client can drive a *deployed* site with
 * nothing but its URL and an API key. Before, the only transport was stdio:
 * `cogenta mcp` had to run on the site's own machine, next to its database,
 * which no assistant on the user's computer can reach.
 *
 * Nothing here is a second implementation. The tools, their gates (input
 * validated before a human is asked, forced approval for every
 * non-reversible write, the identity re-read before the write runs) and the
 * audit are `mcp-tools.ts`, exactly what `cogenta mcp` serves. What differs
 * is only how a caller proves who it is:
 *
 * - an **API key and nothing else** (`Authorization: Bearer cogenta_sk_…`):
 *   the request's actor was already resolved by `resolveActor`, the same
 *   function every REST route goes through — hash lookup, revocation,
 *   expiry, wrong-key back-off and the key's per-minute quota, **on every
 *   request**. A browser session token is refused: a session belongs to a
 *   person at a screen, not to a client configuration file;
 * - the key is re-read by id before every tool call and once more before an
 *   approved write runs, so revoking it in the administration stops a
 *   session at its next message, even mid-approval.
 */

const UNAUTHORIZED_HEADERS = {
  'www-authenticate': 'Bearer realm="cogenta-mcp"',
} as const

export interface McpHttpEndpointOptions {
  readonly tools: Omit<McpSiteToolsOptions, 'transport'>
  readonly apiKeys: Pick<ApiKeyStore, 'getById'>
  readonly version: string
  /** The site's public URL: a browser-based client on this origin may call the endpoint, no other origin may. */
  readonly siteUrl?: string
  /** Bytes one message may carry. */
  readonly maxBodyBytes?: number
  readonly onRequest?: (record: McpHttpRequestRecord) => void
  /** A failure the caller is not shown the details of (see `describeToolError`). */
  readonly onInternalError?: (error: unknown) => void
}

export type McpHttpEndpoint = (
  request: IncomingMessage,
  response: ServerResponse,
  actor: AccessContext['actor'],
) => Promise<void>

function originOf(url: string | undefined): string | null {
  if (url === undefined) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function createMcpHttpEndpoint(options: McpHttpEndpointOptions): McpHttpEndpoint {
  // The actor of each request, resolved by the caller before this endpoint
  // runs — kept by request object, so no request can see another's.
  const actors = new WeakMap<IncomingMessage, AccessContext['actor']>()
  const siteOrigin = originOf(options.siteUrl)
  const instructions = mcpServerInstructions(options.tools.site)

  const handler = createMcpHttpHandler({
    ...(options.maxBodyBytes === undefined ? {} : { maxBodyBytes: options.maxBodyBytes }),
    // DNS-rebinding defence: only the site's own configured origin, never one
    // derived from the request's Host header (which a rebinding attacker controls).
    allowOrigin: (origin) => siteOrigin !== null && origin === siteOrigin,
    ...(options.onRequest === undefined ? {} : { onRequest: options.onRequest }),
    authorize: async (request) => {
      const actor = actors.get(request)
      const presented = typeof request.headers.authorization === 'string'
      if (actor === undefined || actor.id === null) {
        return {
          refused: true,
          status: 401,
          headers: UNAUTHORIZED_HEADERS,
          message: presented
            ? 'This API key is unknown, revoked or expired.'
            : 'Send an API key minted in the administration ("MCP" screen) as "Authorization: Bearer cogenta_sk_…".',
        }
      }
      if (!actor.id.startsWith('apikey:')) {
        return {
          refused: true,
          status: 401,
          headers: UNAUTHORIZED_HEADERS,
          message:
            'The MCP endpoint takes an API key, not a sign-in session. Create one in the administration ("MCP" screen).',
        }
      }
      const resolveIdentity = apiKeyIdentityResolver(
        options.apiKeys,
        actor.id.slice('apikey:'.length),
      )
      const server = createMcpServer({
        name: 'cogenta',
        version: options.version,
        instructions,
        tools: createMcpToolSource({ ...options.tools, transport: 'http' }, resolveIdentity),
        ...(options.onInternalError === undefined
          ? {}
          : { onInternalError: options.onInternalError }),
      })
      return { server, scope: actor.id }
    },
  })

  return async (request, response, actor) => {
    actors.set(request, actor)
    try {
      await handler(request, response)
    } finally {
      actors.delete(request)
    }
  }
}

/**
 * What the administration's "MCP" screen needs to write a client
 * configuration that works as pasted: the endpoint path, whether it is on,
 * and — for a client on this same machine — the absolute command that runs
 * `cogenta mcp` for this very site. Before, the screen showed
 * `"cwd": "/absolute/path/to/your-site"` for the user to fix by hand, and a
 * `cwd` field Claude Code does not read at all.
 *
 * The command is this process's own Node binary and this package's own
 * `bin.js`: the exact program serving the site, so no `npx` lookup (which
 * fails from any folder but the site's, or tries the npm registry) and no
 * reliance on a `PATH` that GUI apps such as Claude Desktop do not inherit.
 */
export interface McpConnectionInfo {
  readonly http: { readonly enabled: boolean; readonly path: string }
  readonly stdio: {
    readonly command: string
    readonly args: readonly string[]
    readonly projectRoot: string
    readonly apiKeyEnv: string
  } | null
  readonly approvalsPath: string
}

export function mcpConnectionInfo(options: {
  readonly httpEnabled: boolean
  readonly projectRoot?: string
  readonly apiKeyEnv: string
}): McpConnectionInfo {
  const bin = fileURLToPath(new URL('../bin.js', import.meta.url))
  return {
    http: { enabled: options.httpEnabled, path: '/api/mcp' },
    stdio:
      options.projectRoot === undefined
        ? null
        : {
            command: process.execPath,
            args: [bin, 'mcp', '--cwd', options.projectRoot],
            projectRoot: options.projectRoot,
            apiKeyEnv: options.apiKeyEnv,
          },
    approvalsPath: '/admin/agents',
  }
}
