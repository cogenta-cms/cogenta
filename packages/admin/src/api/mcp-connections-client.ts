import { authHeader, request } from './http.js'

/**
 * `/api/mcp-connections` — fiche 58 task 3's "MCP Clients" screen: external
 * MCP servers this site's own agents may consume. Distinct from
 * `/api/api-keys`/the "MCP Server" screen (`mcp-client.ts`, `mcp.tsx`),
 * which is the opposite direction — this site's *own* MCP server, exposed
 * outward.
 */

export type McpTransport = 'stdio' | 'http'
export type McpAuthKind = 'none' | 'api_key' | 'oauth'
export type McpConnectionStatus = 'unverified' | 'ok' | 'error'
export type McpToolCost = 'low' | 'medium' | 'high'

export interface McpDiscoveredTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
}

export interface McpExposedTool {
  readonly remoteName: string
  readonly localName: string
  readonly description: string
  readonly sideEffects: boolean
  readonly reversible: boolean
  readonly cost: McpToolCost
}

export interface McpConnectionSummary {
  readonly id: string
  readonly name: string
  readonly transport: McpTransport
  readonly command?: string
  readonly args: readonly string[]
  readonly url?: string
  readonly env: Readonly<Record<string, string>>
  readonly authKind: McpAuthKind
  readonly hasSecret: boolean
  readonly secretEnvVar?: string
  readonly confirmedUnsandboxed: boolean
  readonly enabled: boolean
  readonly status: McpConnectionStatus
  readonly lastError?: string
  readonly discoveredTools: readonly McpDiscoveredTool[]
  readonly lastDiscoveredAt?: string
  readonly exposedTools: readonly McpExposedTool[]
  readonly createdAt: string
  readonly updatedAt: string
}

export function listMcpConnections(token: string): Promise<readonly McpConnectionSummary[]> {
  return request('/api/mcp-connections', { headers: authHeader(token) })
}

export interface CreateMcpConnectionInput {
  readonly name: string
  readonly transport: McpTransport
  readonly command?: string
  readonly args?: readonly string[]
  readonly url?: string
  readonly env?: Readonly<Record<string, string>>
  readonly authKind?: McpAuthKind
  readonly secret?: string
  readonly secretEnvVar?: string
  /**
   * Required `true` for a `stdio` connection — the server refuses
   * structurally (`MCP_CONNECTION_CONFIRMATION_REQUIRED`) without it. Only
   * pass this once the operator has actually seen and accepted the warning
   * this screen shows — never pre-checked, never a default.
   */
  readonly confirmUnsandboxed?: boolean
}

export function createMcpConnection(
  token: string,
  input: CreateMcpConnectionInput,
): Promise<McpConnectionSummary> {
  return request('/api/mcp-connections', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function setMcpConnectionEnabled(
  token: string,
  id: string,
  enabled: boolean,
): Promise<McpConnectionSummary> {
  return request(`/api/mcp-connections/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ enabled }),
  })
}

export async function removeMcpConnection(token: string, id: string): Promise<void> {
  await request(`/api/mcp-connections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

/** Runs a real `initialize()` + `tools/list()` probe against the connection and records the result. */
export function testMcpConnection(token: string, id: string): Promise<McpConnectionSummary> {
  return request(`/api/mcp-connections/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export interface ExposedToolInput {
  readonly remoteName: string
  readonly localName?: string
  readonly description?: string
  readonly sideEffects: boolean
  readonly reversible: boolean
  readonly cost: McpToolCost
}

/** Replaces the whole exposed-tool set for this connection — "absent, pas refusée": a tool not in this list is never wrapped for any agent. */
export function setMcpConnectionExposedTools(
  token: string,
  id: string,
  tools: readonly ExposedToolInput[],
): Promise<McpConnectionSummary> {
  return request(`/api/mcp-connections/${encodeURIComponent(id)}/exposed-tools`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ tools }),
  })
}
