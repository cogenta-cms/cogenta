import { CogentaError } from '@cogenta/core'
import { z } from 'zod'
import type { ExecutableTool, ToolExecutionContext } from '../runtime/types.js'
import type { ToolRegistry } from './registry.js'
import type { ToolContext, ToolDefinition } from './types.js'

/**
 * L4 task 4's actual enforcement point. "Un niveau inférieur ne peut jamais
 * élargir les permissions d'un niveau supérieur" is not applied by the
 * prompt — it is applied by never constructing an `ExecutableTool` for a
 * name outside `allowedNames` in the first place. The model cannot ask its
 * way into a tool that was never handed to `runAgentLoop`; a hallucinated or
 * out-of-manifest call still resolves through the loop's own "no tool named
 * X" path (task 2), which is the same refusal, from a different angle, for
 * the same reason.
 *
 * `allowedNames` not found in `registry` fails immediately, at build time —
 * the same "fail at load, not at call" posture task 11 uses for sub-agents,
 * applied here to catch a misconfigured agent before it ever runs.
 */
export function buildManifest(
  registry: ToolRegistry,
  allowedNames: readonly string[],
  context: Omit<ToolContext, 'signal'>,
): readonly ExecutableTool[] {
  return allowedNames.map((name) => {
    const tool = registry.get(name)
    if (tool === undefined) {
      throw new CogentaError({
        code: 'TOOL_UNKNOWN',
        message: `Agent manifest names "${name}", which no tool in the registry provides.`,
        hint: 'Register the tool before building the manifest, or remove it from the agent definition.',
      })
    }
    return toExecutableTool(tool, context)
  })
}

function toExecutableTool(
  tool: ToolDefinition,
  context: Omit<ToolContext, 'signal'>,
): ExecutableTool {
  return {
    spec: {
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.input) as Readonly<Record<string, unknown>>,
    },
    sideEffects: tool.sideEffects,
    reversible: tool.reversible,
    async execute(input: Readonly<Record<string, unknown>>, execCtx: ToolExecutionContext) {
      const parsedInput = tool.input.safeParse(input)
      if (!parsedInput.success) {
        throw new CogentaError({
          code: 'TOOL_INPUT_INVALID',
          message: `The input for "${tool.name}" did not match its declared schema.`,
          hint: 'This is fed back to the model as a tool error, not thrown out of the run.',
          details: { issues: parsedInput.error.issues },
        })
      }

      const output = await tool.execute(parsedInput.data, { ...context, signal: execCtx.signal })

      const parsedOutput = tool.output.safeParse(output)
      if (!parsedOutput.success) {
        throw new CogentaError({
          code: 'TOOL_OUTPUT_INVALID',
          message: `"${tool.name}" returned a value that did not match its declared output schema.`,
          hint: 'This is a bug in the tool implementation, not in the caller.',
          details: { issues: parsedOutput.error.issues },
        })
      }
      return parsedOutput.data
    },
  }
}
