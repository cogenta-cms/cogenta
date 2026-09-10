import { defineTool, type ToolDefinition } from '@cogenta/agents'
import { z } from 'zod'

/**
 * What was missing for a theme to be *adjusted* rather than only created.
 *
 * The sandbox tools could write a file and render the result, but never read
 * one back. Inside a single generation run that is survivable — the agent
 * still has its own transcript, so it knows what it wrote. Across a second
 * conversation turn ("make it darker", "put the grid on two columns") it is
 * fatal: the agent is handed a theme it has never seen, and its only options
 * are to guess or to rewrite the whole thing from scratch, throwing away
 * every decision the operator just approved.
 *
 * Two tools, because listing and reading are genuinely different questions
 * and a model asked to "read the theme" should not have to guess filenames:
 * `theme.list_sandbox_files` answers "what is in here", and
 * `theme.read_sandbox_file` answers "what does this one say".
 *
 * Both are read-only (`sideEffects: false`) and confined to one sandbox
 * directory — the same directory `theme.write_sandbox_file` already writes
 * to, with the same host-side path-escape guard in `@cogenta/cli`, which is
 * where the real filesystem lives.
 */

export interface ReadSandboxToolsOptions {
  readonly listFiles: (input: { readonly sandboxId: string }) => Promise<readonly string[]>
  readonly readFile: (input: {
    readonly sandboxId: string
    readonly path: string
  }) => Promise<string>
  /** A theme file that is genuinely enormous is truncated rather than allowed to crowd out the rest of the conversation. */
  readonly maxFileChars?: number
}

const DEFAULT_MAX_FILE_CHARS = 24_000

const ListInputSchema = z.object({ sandboxId: z.string().min(1) })
export type ListSandboxFilesInput = z.infer<typeof ListInputSchema>

const ListOutputSchema = z.object({ files: z.array(z.string()) })
export type ListSandboxFilesOutput = z.infer<typeof ListOutputSchema>

const ReadInputSchema = z.object({
  sandboxId: z.string().min(1),
  /** Sandbox-relative, exactly as `theme.list_sandbox_files` returned it. */
  path: z.string().min(1),
})
export type ReadSandboxFileInput = z.infer<typeof ReadInputSchema>

const ReadOutputSchema = z.object({
  path: z.string(),
  content: z.string(),
  truncated: z.boolean().optional(),
})
export type ReadSandboxFileOutput = z.infer<typeof ReadOutputSchema>

export function createListSandboxFilesTool(
  options: Pick<ReadSandboxToolsOptions, 'listFiles'>,
): ToolDefinition<ListSandboxFilesInput, ListSandboxFilesOutput> {
  return defineTool({
    name: 'theme.list_sandbox_files',
    version: '1.0.0',
    description: `Lists every file currently in a theme sandbox, as sandbox-relative paths. Call it first when you are changing a theme you did not write in this conversation — you cannot correct a file whose name you had to guess, and a theme's stylesheet can be called anything.`,
    input: ListInputSchema,
    output: ListOutputSchema,
    permissions: ['theme.write_sandbox'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      return { files: [...(await options.listFiles({ sandboxId: input.sandboxId }))] }
    },
  })
}

export function createReadSandboxFileTool(
  options: Pick<ReadSandboxToolsOptions, 'readFile' | 'maxFileChars'>,
): ToolDefinition<ReadSandboxFileInput, ReadSandboxFileOutput> {
  const limit = options.maxFileChars ?? DEFAULT_MAX_FILE_CHARS
  return defineTool({
    name: 'theme.read_sandbox_file',
    version: '1.0.0',
    description: `Returns the current contents of one file in a theme sandbox. Read a file before changing it: a write replaces the whole file, so editing from memory — or from what you assume a previous run wrote — silently drops everything you did not happen to reproduce. When a request asks to adjust part of a theme, read the file, change that part, and write the whole corrected file back.`,
    input: ReadInputSchema,
    output: ReadOutputSchema,
    permissions: ['theme.write_sandbox'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      const content = await options.readFile({ sandboxId: input.sandboxId, path: input.path })
      const truncated = content.length > limit
      return {
        path: input.path,
        content: truncated ? `${content.slice(0, limit)}\n/* …truncated */` : content,
        truncated,
      }
    },
  })
}
