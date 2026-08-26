import { defineTool, type ToolCost, type ToolDefinition } from '@cogenta/agents'
import { CogentaError } from '@cogenta/core'
import type { z } from 'zod'
import type { McpClient } from './types.js'

export interface WrapMcpToolOptions<Input, Output> {
  readonly client: McpClient
  /** The tool's name on the remote server — may differ from `name` below. */
  readonly remoteName: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly input: z.ZodType<Input>
  readonly output: z.ZodType<Output>
  /**
   * Not read from the remote server's own `tools/list` — a third-party
   * server has no way to declare, and no reason to be trusted to declare,
   * what a local agent may do with it. "Le client MCP permet aux agents de
   * consommer des serveurs tiers, avec les mêmes permissions déclarées que
   * les outils internes": these five fields are the integrator's own
   * declaration, checked by the same runtime (registry, manifest, audit,
   * autonomy) as every other `defineTool` built in-repo.
   *
   * Fiche 58 task 6 settles the taxonomy: an MCP client integrator (the
   * registry wiring in `../registry/`) always passes exactly one string
   * here, `mcp.external:<connectionId>.<remoteName>` — one permission per
   * checked remote tool, never `mcp.external.<connexion>` (rejected by the
   * security review: that would grant every tool on a connection
   * indifferently of its own risk, and R4 requires an outcome to declare
   * its own permission, not inherit its connection's). This module itself
   * does not enforce that convention — it accepts whatever `permissions`
   * its caller declares, exactly like every other `defineTool` call — the
   * enforcement is structural: nothing in this repository constructs a
   * wrapped MCP tool except `../registry/`'s own builder, which always
   * follows it.
   */
  readonly permissions: readonly string[]
  readonly sideEffects: boolean
  readonly reversible: boolean
  readonly cost: ToolCost
}

/**
 * Turns one tool discovered on a remote MCP server into an ordinary
 * `ToolDefinition` — from here on, the runtime cannot tell it apart from a
 * tool implemented in this repository. `execute` calls the remote tool and
 * maps its MCP result back to the declared Zod `output`; a remote failure
 * (`isError: true`) becomes a thrown error, same as a local tool's.
 *
 * Fiche 58 task 1bis: `execute` takes `(input, ctx)` — contract C's own
 * shape — and forwards `ctx.signal` to the client's per-call `callTool`, so
 * the run's own cancellation (budget exceeded, kill switch, the agent loop
 * itself being aborted) reaches the remote process the same way a hung
 * server's own timeout does: the connection's underlying `child_process` is
 * killed, not merely "stopped waiting on our end while it keeps running".
 */
export function wrapMcpTool<Input, Output>(
  options: WrapMcpToolOptions<Input, Output>,
): ToolDefinition<Input, Output> {
  return defineTool({
    name: options.name,
    version: options.version,
    description: options.description,
    input: options.input,
    output: options.output,
    permissions: options.permissions,
    sideEffects: options.sideEffects,
    reversible: options.reversible,
    cost: options.cost,
    async execute(input, ctx) {
      const result = await options.client.callTool(
        options.remoteName,
        input as Readonly<Record<string, unknown>>,
        { signal: ctx.signal },
      )
      const text = result.content.map((block) => block.text).join('\n')
      if (result.isError) {
        throw new CogentaError({
          code: 'MCP_CLIENT_TOOL_FAILED',
          message: text === '' ? `"${options.remoteName}" failed on the remote MCP server.` : text,
          hint: 'This is the remote tool reporting its own failure, not a protocol error.',
        })
      }
      try {
        return JSON.parse(text) as Output
      } catch {
        return text as unknown as Output
      }
    },
  })
}
