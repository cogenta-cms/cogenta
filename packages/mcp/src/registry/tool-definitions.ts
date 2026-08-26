import type { ToolDefinition } from '@cogenta/agents'
import type { Logger } from '@cogenta/core'
import { z } from 'zod'
import { createSandboxWorkDir, type SandboxWorkDir } from '../client/sandbox.js'
import { createMcpStdioClient, type McpStdioClientOptions } from '../client/stdio-client.js'
import type { McpClient } from '../client/types.js'
import { wrapMcpTool } from '../client/wrap-tool.js'
import type { McpConnectionStore, McpConnectionSummary } from './store.js'

/**
 * Fiche 58 task 4's runtime wiring. Structurally, the fiche names
 * `packages/agents/src/runtime/` for this — it lives here in `@cogenta/mcp`
 * instead, and the discrepancy is deliberate, signalled rather than
 * silently worked around: `@cogenta/mcp` already depends on
 * `@cogenta/agents` (for `ToolDefinition`/`defineTool` — `../client/
 * wrap-tool.js`), so a reverse dependency the fiche's own path would
 * require is a package cycle. `packages/cli/src/commands/agent-runtime.ts`
 * — which already depends on both packages, the same way it already
 * builds this site's real `ToolRegistry` — is where this assembly's
 * `definitions` are actually merged in; see that file's own comment at the
 * call site.
 *
 * One `McpClient` per enabled connection that has at least one exposed
 * tool, built once and shared by every `wrapMcpTool` for that connection —
 * never one spawned process per tool. A connection that fails to
 * `initialize()` here is logged and skipped, never thrown: one
 * misbehaving external server must not keep the rest of a site's agents
 * and tools from starting at all (the same posture L22 task 1's
 * `resolveProvider` already takes for a missing LLM provider — R2's
 * "runs refuse, the rest of the CMS does not").
 *
 * **Known, accepted limitation**: `wrapMcpTool` requires a static Zod
 * input/output schema per tool, because Contract C's `ToolDefinition`
 * always has one — there is no JSON-Schema-to-Zod translator in this
 * repository (adding one would be a new dependency, R9), so a
 * dynamically-discovered remote tool is wrapped with a permissive
 * `z.record(...)` input rather than the real schema the remote server
 * declared in `tools/list`. Local validation is therefore looser than the
 * remote tool's own; the remote server still validates its own call and
 * reports `isError: true` on a bad one, exactly like every other MCP tool
 * failure. The JSON schema shown to the model (`manifest.ts`'s
 * `z.toJSONSchema`) is correspondingly generic, not the remote's richer
 * one — a real usability gap, honestly documented rather than hidden.
 */

export interface BuildMcpToolDefinitionsOptions {
  readonly store: McpConnectionStore
  readonly logger?: Logger
  readonly callTimeoutMs?: number
  /** Injectable for tests — defaults to a real spawned process (see `McpStdioClientOptions.spawnFn`). */
  readonly spawnFn?: McpStdioClientOptions['spawnFn']
}

export interface McpToolDefinitionsAssembly {
  readonly definitions: readonly ToolDefinition[]
  /** Closes every underlying `McpClient` and removes every sandbox working directory this assembly created — call once, on shutdown. */
  dispose(): Promise<void>
}

const OPAQUE_INPUT = z.record(z.string(), z.unknown())

function localToolName(connection: McpConnectionSummary, localName: string): string {
  return `mcp.external.${connection.id}.${localName}`
}

/** Fiche 58 task 6's settled taxonomy: one permission per checked remote tool, never per connection. */
function permissionFor(connection: McpConnectionSummary, remoteName: string): string {
  return `mcp.external:${connection.id}.${remoteName}`
}

export async function buildMcpToolDefinitions(
  options: BuildMcpToolDefinitionsOptions,
): Promise<McpToolDefinitionsAssembly> {
  const connections = (await options.store.list()).filter(
    (connection) => connection.enabled && connection.exposedTools.length > 0,
  )

  const definitions: ToolDefinition[] = []
  const clients: McpClient[] = []
  const sandboxes: SandboxWorkDir[] = []

  for (const connection of connections) {
    if (connection.transport !== 'stdio') {
      options.logger?.warn('mcp registry: skipping connection with unsupported transport', {
        connection: connection.id,
        transport: connection.transport,
      })
      continue
    }
    if (connection.command === undefined) {
      options.logger?.warn('mcp registry: skipping connection with no command configured', {
        connection: connection.id,
      })
      continue
    }

    let secret: string | undefined
    if (connection.authKind !== 'none' && connection.hasSecret) {
      try {
        secret = await options.store.decryptSecret(connection.id)
      } catch (error) {
        options.logger?.error('mcp registry: could not decrypt connection secret, skipping', {
          connection: connection.id,
          error: error instanceof Error ? error.message : String(error),
        })
        continue
      }
    }

    const env: Record<string, string> = { ...connection.env }
    if (connection.secretEnvVar !== undefined && secret !== undefined) {
      env[connection.secretEnvVar] = secret
    }

    const sandbox = await createSandboxWorkDir()
    let client: McpClient
    try {
      client = createMcpStdioClient({
        command: connection.command,
        args: connection.args,
        env,
        cwd: sandbox.path,
        ...(options.logger === undefined ? {} : { logger: options.logger }),
        ...(options.callTimeoutMs === undefined ? {} : { callTimeoutMs: options.callTimeoutMs }),
        ...(options.spawnFn === undefined ? {} : { spawnFn: options.spawnFn }),
      })
      await client.initialize()
    } catch (error) {
      options.logger?.error('mcp registry: connection failed to initialize, skipping', {
        connection: connection.id,
        error: error instanceof Error ? error.message : String(error),
      })
      await sandbox.cleanup()
      continue
    }
    clients.push(client)
    sandboxes.push(sandbox)

    for (const tool of connection.exposedTools) {
      definitions.push(
        wrapMcpTool({
          client,
          remoteName: tool.remoteName,
          name: localToolName(connection, tool.localName),
          version: '1.0.0',
          description: tool.description,
          input: OPAQUE_INPUT,
          output: z.unknown(),
          permissions: [permissionFor(connection, tool.remoteName)],
          sideEffects: tool.sideEffects,
          reversible: tool.reversible,
          cost: tool.cost,
        }),
      )
    }
  }

  return {
    definitions,
    async dispose() {
      for (const client of clients) client.close()
      await Promise.all(sandboxes.map((sandbox) => sandbox.cleanup()))
    },
  }
}
