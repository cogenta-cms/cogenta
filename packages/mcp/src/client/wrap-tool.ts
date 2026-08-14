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
    async execute(input) {
      const result = await options.client.callTool(
        options.remoteName,
        input as Readonly<Record<string, unknown>>,
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
