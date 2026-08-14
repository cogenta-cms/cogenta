import { CogentaError } from '@cogenta/core'
import type { ToolDefinition } from './types.js'

export interface ToolRegistry {
  list(): readonly ToolDefinition[]
  get(name: string): ToolDefinition | undefined
}

/** Every tool a site knows about — not what any one agent may call, that's the manifest (`buildManifest`) built on top of this. */
export function createToolRegistry(tools: readonly ToolDefinition[]): ToolRegistry {
  const byName = new Map<string, ToolDefinition>()
  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new CogentaError({
        code: 'TOOL_DUPLICATE',
        message: `Two tools are registered under the name "${tool.name}".`,
        hint: 'Tool names must be unique across the whole registry, core and third-party alike.',
      })
    }
    byName.set(tool.name, tool)
  }

  return {
    list: () => [...byName.values()],
    get: (name) => byName.get(name),
  }
}
