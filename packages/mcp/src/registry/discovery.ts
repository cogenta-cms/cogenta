import type { Logger } from '@cogenta/core'
import { createSandboxWorkDir } from '../client/sandbox.js'
import { createMcpStdioClient, type McpStdioClientOptions } from '../client/stdio-client.js'
import type { McpClient } from '../client/types.js'
import type { McpConnectionSummary, McpDiscoveredTool } from './store.js'

export interface DiscoverMcpConnectionOptions {
  readonly connection: McpConnectionSummary
  /** The decrypted secret for this connection, when `connection.authKind !== 'none'` — resolved by the caller (`McpConnectionStore.decryptSecret`), never by this module. */
  readonly secret?: string
  readonly logger?: Logger
  readonly callTimeoutMs?: number
  /** Injectable for tests — defaults to a real spawned process (see `McpStdioClientOptions.spawnFn`). */
  readonly spawnFn?: McpStdioClientOptions['spawnFn']
}

export type DiscoverMcpConnectionResult =
  | { readonly status: 'ok'; readonly tools: readonly McpDiscoveredTool[] }
  | { readonly status: 'error'; readonly error: string }

function envFor(
  connection: McpConnectionSummary,
  secret: string | undefined,
): Record<string, string> {
  const env: Record<string, string> = { ...connection.env }
  if (connection.secretEnvVar !== undefined && secret !== undefined) {
    env[connection.secretEnvVar] = secret
  }
  return env
}

/**
 * Fiche 58 task 3's "test (`initialize` + `tools/list`)" — the one real
 * network/process boundary the "MCP Clients" admin screen's "test
 * connection" action crosses. Goes through the exact same sandboxed
 * `createMcpStdioClient` an actual agent run later uses
 * (`./tool-definitions.js`) — never a lighter, unsandboxed path just
 * because this call is "only a test": a malicious `stdio` server has no
 * way to tell a probe from a real call.
 *
 * `http` connections are stored (fiche 58 task 2's schema names both
 * transports) but this module honestly refuses them — no HTTP MCP client
 * exists in this repository yet (see `../index.js`'s own module comment).
 * Storing the shape without silently pretending to support it is the
 * documented, deliberate gap; claiming to test an HTTP connection that
 * cannot actually connect would be worse than refusing outright.
 */
export async function discoverMcpConnection(
  options: DiscoverMcpConnectionOptions,
): Promise<DiscoverMcpConnectionResult> {
  const { connection } = options
  if (connection.transport !== 'stdio') {
    return {
      status: 'error',
      error:
        'HTTP MCP connections are stored but not implemented yet — only "stdio" connections can be tested or used today.',
    }
  }
  if (connection.command === undefined) {
    return { status: 'error', error: 'This connection has no command configured.' }
  }

  const sandbox = await createSandboxWorkDir()
  let client: McpClient | undefined
  try {
    client = createMcpStdioClient({
      command: connection.command,
      args: connection.args,
      env: envFor(connection, options.secret),
      cwd: sandbox.path,
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      ...(options.callTimeoutMs === undefined ? {} : { callTimeoutMs: options.callTimeoutMs }),
      ...(options.spawnFn === undefined ? {} : { spawnFn: options.spawnFn }),
    })
    await client.initialize()
    const tools = await client.listTools()
    return {
      status: 'ok',
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  } finally {
    client?.close()
    await sandbox.cleanup()
  }
}
