import { diffValues } from '../reversibility/diff.js'
import type { ExecutableTool, ToolExecutionContext } from '../runtime/types.js'
import type { SandboxCallResult } from './types.js'

export interface WithSandboxOptions {
  /**
   * Reads whatever state a diff should be computed over (e.g. the copied
   * site's data) — called once before and once after a reverted write. No
   * generic "read the current state" exists in this runtime (same limit
   * `diffValues` itself documents), so without this the sandbox still
   * simulates the write safely, it just cannot report a `diff`, only
   * `wouldHaveApplied`.
   */
  readonly snapshot?: () => Promise<unknown>
}

/**
 * A read tool (`sideEffects` not `true`) is unchanged — "lecture réelle".
 * A side-effecting, reversible tool is genuinely called against the copy and
 * immediately reverted — "écriture simulée": the copy ends the call in the
 * same state it started in, but what the call produced (and, with
 * `snapshot`, a real before/after diff) is captured and returned instead of
 * the tool's own output. A side-effecting tool with no `revert()` is never
 * called at all — there is no safe way to undo it on the copy, so refusing
 * is the only sandbox-safe answer. "C'est le prérequis à toute activation en
 * autonomie" (task 9's `autonomous` level).
 */
export function withSandbox(
  tool: ExecutableTool,
  options: WithSandboxOptions = {},
): ExecutableTool {
  if (tool.sideEffects !== true) return tool

  return {
    ...tool,
    async execute(
      input: Readonly<Record<string, unknown>>,
      ctx: ToolExecutionContext,
    ): Promise<SandboxCallResult> {
      if (tool.revert === undefined) {
        return {
          simulated: false,
          note: `"${tool.spec.name}" has no revert() — refusing to run it even once, since the sandbox could not undo it on the copied site.`,
        }
      }

      const before = await options.snapshot?.()
      const output = await tool.execute(input, ctx)
      const after = await options.snapshot?.()
      await tool.revert(output, ctx)

      return {
        simulated: true,
        wouldHaveApplied: output,
        note: `"${tool.spec.name}" ran against the copy and was immediately reverted — a simulated write.`,
        ...(before === undefined || after === undefined ? {} : { diff: diffValues(before, after) }),
      }
    },
  }
}

export function withSandboxForManifest(
  tools: readonly ExecutableTool[],
  options?: WithSandboxOptions,
): readonly ExecutableTool[] {
  return tools.map((tool) => withSandbox(tool, options))
}
