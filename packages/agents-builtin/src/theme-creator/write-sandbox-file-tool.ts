import { defineTool, type ToolDefinition } from '@cogenta/agents'
import { z } from 'zod'

/**
 * `theme.write_sandbox_file` (`tools@1.6`, `docs/04-contrats.md`) — fiche 73
 * task 7. Same shape as `code.propose_patch` (`code.patch`,
 * `../developer/patch-tool.ts`), on purpose: a real, effectful write with a
 * real `revert`, `sideEffects: true` + `reversible: true` keeping it inside
 * `withAutonomy`'s ordinary gate rather than always forcing approval. What
 * differs is the destination and the meaning of "revert": `code.patch`
 * opens a pull request nothing merges automatically, this writes straight
 * into one file of one theme *sandbox* (`<projectRoot>/.cogenta/theme-sandbox
 * /<id>/`, fiche 73 task 4) — never `themes/`, and so never anything a live
 * request could resolve. `revert` deletes the file it wrote, the same
 * "undo the one write this tool made" meaning `deps.patch`'s `revert`
 * already has, just without a forge in between.
 *
 * `writeFile`/`deleteFile` are factory options, not part of the Zod input
 * schema — the same shape `theme.propose_theme`'s `resolveProvider` and
 * `code.propose_patch`'s `prClient` already use: this package cannot import
 * `@cogenta/cli`'s `theme-sandbox.ts` (the dependency arrow runs the other
 * way — `@cogenta/cli` depends on `@cogenta/agents-builtin`, never the
 * reverse), so the real filesystem write — and the path-escape guard that
 * makes it safe to hand a model — lives in `@cogenta/cli` and is threaded in
 * here as a plain function.
 */

export interface WriteSandboxFileToolOptions {
  readonly writeFile: (input: {
    readonly sandboxId: string
    readonly path: string
    readonly content: string
  }) => Promise<{ readonly path: string }>
  readonly deleteFile: (input: {
    readonly sandboxId: string
    readonly path: string
  }) => Promise<void>
}

const WriteSandboxFileInputSchema = z.object({
  /** An id `theme.propose_theme`-adjacent tooling (or a human) already created — this tool never creates a sandbox itself. */
  sandboxId: z.string().min(1),
  /** Sandbox-relative, e.g. `"theme.render.mjs"` — never absolute, never `../`-prefixed. The real escape guard is enforced host-side, in `@cogenta/cli`; this tool has no filesystem of its own to guard. */
  path: z.string().min(1),
  content: z.string(),
})
export type WriteSandboxFileInput = z.infer<typeof WriteSandboxFileInputSchema>

const WriteSandboxFileOutputSchema = z.object({ sandboxId: z.string(), path: z.string() })
export type WriteSandboxFileOutput = z.infer<typeof WriteSandboxFileOutputSchema>

export function createWriteSandboxFileTool(
  options: WriteSandboxFileToolOptions,
): ToolDefinition<WriteSandboxFileInput, WriteSandboxFileOutput> {
  return defineTool({
    name: 'theme.write_sandbox_file',
    version: '1.0.0',
    description:
      'Writes one file into a theme sandbox. Never writes into themes/ directly, and never touches anything a live request could resolve — deploying the sandbox stays a separate, human-confirmed action.',
    input: WriteSandboxFileInputSchema,
    output: WriteSandboxFileOutputSchema,
    permissions: ['theme.write_sandbox'],
    sideEffects: true,
    reversible: true,
    cost: 'low',
    async execute(input) {
      const result = await options.writeFile({
        sandboxId: input.sandboxId,
        path: input.path,
        content: input.content,
      })
      return { sandboxId: input.sandboxId, path: result.path }
    },
    async revert(receipt) {
      await options.deleteFile({ sandboxId: receipt.sandboxId, path: receipt.path })
    },
  })
}
