import { authHeader, request } from './http.js'

/**
 * `GET /api/mcp-info` — what the "MCP" screen needs to print a client
 * configuration that works as pasted: whether `/api/mcp` is served, and the
 * exact command that runs `cogenta mcp` for this site on its own machine.
 * Admin-only on the server (it names a path on the server's disk).
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

export function getMcpInfo(token: string): Promise<McpConnectionInfo> {
  return request('/api/mcp-info', { headers: authHeader(token) })
}
