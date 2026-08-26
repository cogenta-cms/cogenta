import { CogentaError, type Logger } from '@cogenta/core'
import type {
  McpAuthKind,
  McpConnectionStore,
  McpConnectionSummary,
  McpExposedTool,
  McpTransport,
} from '@cogenta/mcp'
import { discoverMcpConnection } from '@cogenta/mcp'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/mcp-connections` — fiche 58 task 3's "MCP Clients" admin screen.
 * **Not** `cogenta mcp`/`/api/mcp` (the *server* this site exposes outward,
 * `packages/cli/src/commands/mcp.ts`) — this is the opposite direction:
 * external MCP servers this site's own agents may consume, wired into the
 * runtime by `packages/cli/src/commands/agent-runtime.ts` (`@cogenta/mcp`'s
 * `buildMcpToolDefinitions`).
 *
 * Admin-only throughout, same posture as `/api/providers`: this router can
 * both start an arbitrary third-party executable (`POST .../test`) and
 * decide which of its tools an agent may call at all — never a
 * lower-privileged actor's business.
 */

export interface McpConnectionsRouterOptions {
  readonly connections: McpConnectionStore
  readonly logger?: Logger
  /** Mount point. `/api/mcp-connections` by default. */
  readonly basePath?: string
  /** Injectable for tests — defaults to `@cogenta/mcp`'s real `discoverMcpConnection`. */
  readonly discover?: typeof discoverMcpConnection
  /**
   * Called after every mutation (create/enable/disable/remove/test/expose
   * tools) — `serve.ts` wires this to the agent runtime's
   * `refreshMcpTools()`, the same "no restart needed" posture
   * `ProviderRegistryLike.upsert`'s own `onMutated` already gives
   * `/api/providers` (`packages/cli/src/commands/agent-runtime.ts`'s
   * `createLiveProviderRegistry`). Best-effort: a failure here never fails
   * the HTTP response it followed (ADR-0018 — "une écriture qui échoue ne
   * doit jamais faire échouer l'action qu'elle audite/rafraîchit").
   */
  readonly onMutated?: () => Promise<void>
}

export interface McpConnectionsRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/mcp-connections'
const TRANSPORTS: readonly McpTransport[] = ['stdio', 'http']
const AUTH_KINDS: readonly McpAuthKind[] = ['none', 'api_key', 'oauth']
const COSTS = ['low', 'medium', 'high'] as const

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may manage MCP client connections.',
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
    code: 'MCP_CONNECTION_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'MCP connection routes are /api/mcp-connections, /api/mcp-connections/:id, /api/mcp-connections/:id/test and /api/mcp-connections/:id/exposed-tools.',
  })
}

function invalid(message: string, hint: string): CogentaError {
  return new CogentaError({ code: 'MCP_CONNECTION_INVALID', message, hint })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('The request body is not an object.', 'Send a JSON object.')
  }
  return body as Record<string, unknown>
}

function stringArrayOrUndefined(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw invalid(`"${field}" must be an array of strings when given.`, `Fix "${field}" and retry.`)
  }
  return value as readonly string[]
}

function stringRecordOrUndefined(
  value: unknown,
  field: string,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(
      `"${field}" must be an object of strings when given.`,
      `Fix "${field}" and retry.`,
    )
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.some(([, v]) => typeof v !== 'string')) {
    throw invalid(`"${field}" must map to string values only.`, `Fix "${field}" and retry.`)
  }
  return value as Readonly<Record<string, string>>
}

function parseCreateBody(body: unknown): Parameters<McpConnectionStore['create']>[0] {
  const record = asRecord(body)
  const name = record.name
  const transport = record.transport
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw invalid(
      'A connection needs a non-empty "name".',
      'Send { "name": "…", "transport": "stdio" | "http", … }.',
    )
  }
  if (typeof transport !== 'string' || !TRANSPORTS.includes(transport as McpTransport)) {
    throw invalid(
      `"transport" must be one of ${TRANSPORTS.join(', ')}.`,
      'Send "stdio" for a locally spawned server, "http" once that transport ships.',
    )
  }
  const authKindRaw = record.authKind
  const authKind = authKindRaw === undefined ? undefined : (authKindRaw as McpAuthKind)
  if (authKind !== undefined && !AUTH_KINDS.includes(authKind)) {
    throw invalid(
      `"authKind" must be one of ${AUTH_KINDS.join(', ')}.`,
      'Fix "authKind" and retry.',
    )
  }
  const command = record.command
  const url = record.url
  const secret = record.secret
  const secretEnvVar = record.secretEnvVar
  const confirmUnsandboxed = record.confirmUnsandboxed
  const args = stringArrayOrUndefined(record.args, 'args')
  const env = stringRecordOrUndefined(record.env, 'env')

  if (transport === 'stdio' && (typeof command !== 'string' || command.trim().length === 0)) {
    throw invalid(
      'A "stdio" connection needs a non-empty "command".',
      'Send the absolute path (or resolvable name) of the executable to spawn.',
    )
  }
  if (transport === 'http' && (typeof url !== 'string' || url.trim().length === 0)) {
    throw invalid(
      'An "http" connection needs a non-empty "url".',
      "Send the remote MCP server's URL.",
    )
  }

  return {
    name,
    transport: transport as McpTransport,
    ...(typeof command === 'string' ? { command } : {}),
    ...(typeof url === 'string' ? { url } : {}),
    ...(args === undefined ? {} : { args }),
    ...(env === undefined ? {} : { env }),
    ...(authKind === undefined ? {} : { authKind }),
    ...(typeof secret === 'string' && secret.length > 0 ? { secret } : {}),
    ...(typeof secretEnvVar === 'string' && secretEnvVar.length > 0 ? { secretEnvVar } : {}),
    ...(typeof confirmUnsandboxed === 'boolean' ? { confirmUnsandboxed } : {}),
  }
}

function parseExposedTools(
  body: unknown,
  discovered: McpConnectionSummary['discoveredTools'],
): readonly McpExposedTool[] {
  const record = asRecord(body)
  const tools = record.tools
  if (!Array.isArray(tools)) {
    throw invalid('"tools" must be an array.', 'Send { "tools": [ { "remoteName": "…", … }, … ] }.')
  }
  const discoveredByName = new Map(discovered.map((tool) => [tool.name, tool]))
  return tools.map((raw, index) => {
    const item = asRecord(raw)
    const remoteName = item.remoteName
    if (typeof remoteName !== 'string' || remoteName.length === 0) {
      throw invalid(`tools[${index}] needs a non-empty "remoteName".`, 'Fix the entry and retry.')
    }
    const discoveredTool = discoveredByName.get(remoteName)
    const localName = item.localName
    const description = item.description
    const sideEffects = item.sideEffects
    const reversible = item.reversible
    const cost = item.cost
    if (typeof sideEffects !== 'boolean' || typeof reversible !== 'boolean') {
      throw invalid(
        `tools[${index}] needs boolean "sideEffects" and "reversible" — never inherited from the remote server (fiche 58 task 6).`,
        'Declare them explicitly for this exposed tool.',
      )
    }
    if (typeof cost !== 'string' || !(COSTS as readonly string[]).includes(cost)) {
      throw invalid(
        `tools[${index}] needs "cost" to be one of ${COSTS.join(', ')}.`,
        'Fix the entry and retry.',
      )
    }
    return {
      remoteName,
      localName: typeof localName === 'string' && localName.length > 0 ? localName : remoteName,
      description:
        typeof description === 'string' && description.length > 0
          ? description
          : (discoveredTool?.description ?? remoteName),
      sideEffects,
      reversible,
      cost: cost as McpExposedTool['cost'],
    }
  })
}

export function createMcpConnectionsRouter(
  options: McpConnectionsRouterOptions,
): McpConnectionsRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const discover = options.discover ?? discoverMcpConnection

  async function notifyMutated(): Promise<void> {
    await options.onMutated?.().catch(() => undefined)
  }

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()
        const [id, action, extra] = segments

        // GET|POST /api/mcp-connections
        if (id === undefined) {
          if (method === 'GET') {
            return jsonResponse(200, { data: await options.connections.list() })
          }
          if (method === 'POST') {
            const input = parseCreateBody(request.body)
            const created = await options.connections.create(input)
            await notifyMutated()
            return jsonResponse(201, { data: created })
          }
          return methodNotAllowed(['GET', 'POST'])
        }

        if (action === undefined) {
          if (method === 'GET') {
            const found = await options.connections.get(id)
            if (found === undefined) throw noRoute()
            return jsonResponse(200, { data: found })
          }
          if (method === 'PATCH') {
            const body = asRecord(request.body)
            const enabled = body.enabled
            if (typeof enabled !== 'boolean') {
              throw invalid(
                'Nothing to update — send { "enabled": true|false }.',
                'Send a boolean "enabled".',
              )
            }
            const updated = await options.connections.setEnabled(id, enabled)
            await notifyMutated()
            return jsonResponse(200, { data: updated })
          }
          if (method === 'DELETE') {
            await options.connections.remove(id)
            await notifyMutated()
            return jsonResponse(200, { data: { id, removed: true } })
          }
          return methodNotAllowed(['GET', 'PATCH', 'DELETE'])
        }

        if (extra !== undefined) throw noRoute()

        // POST /api/mcp-connections/:id/test — fiche 58 task 3's real
        // `initialize()` + `tools/list()` probe, through the exact same
        // sandboxed client an actual agent run uses.
        if (action === 'test') {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          const connection = await options.connections.get(id)
          if (connection === undefined) throw noRoute()
          let secret: string | undefined
          if (connection.authKind !== 'none' && connection.hasSecret) {
            secret = await options.connections.decryptSecret(id)
          }
          const result = await discover({
            connection,
            ...(secret === undefined ? {} : { secret }),
            ...(options.logger === undefined ? {} : { logger: options.logger }),
          })
          const updated = await options.connections.recordDiscovery(id, result)
          await notifyMutated()
          return jsonResponse(200, { data: updated })
        }

        // PUT /api/mcp-connections/:id/exposed-tools — the admin's own
        // checkbox decision (task 3): "absent, pas refusée" — a remote tool
        // never listed here is never wrapped for any agent.
        if (action === 'exposed-tools') {
          if (method !== 'PUT') return methodNotAllowed(['PUT'])
          const connection = await options.connections.get(id)
          if (connection === undefined) throw noRoute()
          const tools = parseExposedTools(request.body, connection.discoveredTools)
          const updated = await options.connections.setExposedTools(id, tools)
          await notifyMutated()
          return jsonResponse(200, { data: updated })
        }

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
