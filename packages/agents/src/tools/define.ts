import { CogentaError } from '@cogenta/core'
import type { ToolDefinition } from './types.js'

/**
 * Structural validation of Contract C's two hard rules that a type alone
 * cannot enforce: a `sideEffects: true` tool must be able to undo itself, and
 * a tool must actually declare what it needs (an empty `permissions` array
 * is either a mistake or a tool that should not exist — the registry has no
 * way to gate an unpermissioned call, which defeats R4 before it starts).
 * Returns the definition frozen, so nothing downstream can mutate a shared
 * tool object between calls.
 */
export function defineTool<Input, Output>(
  definition: ToolDefinition<Input, Output>,
): ToolDefinition<Input, Output> {
  if (definition.permissions.length === 0) {
    throw new CogentaError({
      code: 'TOOL_DEFINITION_INVALID',
      message: `Tool "${definition.name}" declares no permissions.`,
      hint: 'List at least one permission — an empty list cannot be gated by the tool registry.',
    })
  }

  if (definition.sideEffects && definition.reversible && definition.revert === undefined) {
    throw new CogentaError({
      code: 'TOOL_DEFINITION_INVALID',
      message: `Tool "${definition.name}" declares sideEffects and reversible but implements no revert().`,
      hint: 'Implement revert(), or set reversible: false so a human approves every call regardless of autonomy level.',
    })
  }

  return Object.freeze(definition)
}
