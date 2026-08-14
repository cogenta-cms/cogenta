import { newId } from '@cogenta/core'
import type { ExecutableTool, ToolExecutionContext } from '../runtime/types.js'
import type { Receipt, ReceiptStore } from './types.js'

export interface WithReceiptsOptions {
  readonly agentName: string
  readonly store: ReceiptStore
  readonly now?: () => number
  readonly newId?: () => string
}

/**
 * Captures a `Receipt` after every successful call of a `reversible: true`
 * tool — nothing else changes about the call, and nothing is captured for a
 * tool that is not reversible (there would be nothing to revert it with).
 * Composes with `withAudit`/`withAutonomy`: order does not matter for what
 * gets captured, since this only reads the tool's own output.
 */
export function withReceipts(tool: ExecutableTool, options: WithReceiptsOptions): ExecutableTool {
  if (tool.reversible !== true) return tool

  const now = options.now ?? Date.now
  const generateId = options.newId ?? newId

  return {
    ...tool,
    async execute(input: Readonly<Record<string, unknown>>, ctx: ToolExecutionContext) {
      const output = await tool.execute(input, ctx)
      const receipt: Receipt = {
        id: generateId(),
        agentName: options.agentName,
        toolName: tool.spec.name,
        input,
        output,
        executedAt: new Date(now()).toISOString(),
      }
      await options.store.save(receipt)
      return output
    },
  }
}

/** Applies `withReceipts` to every tool in a manifest. */
export function withReceiptsForManifest(
  tools: readonly ExecutableTool[],
  options: WithReceiptsOptions,
): readonly ExecutableTool[] {
  return tools.map((tool) => withReceipts(tool, options))
}
