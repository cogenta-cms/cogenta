import { defineTool, type ToolDefinition } from '@cogenta/agents'
import { z } from 'zod'
import { bumpDependencyVersion } from './bump-version.js'
import type { PrClient } from './pr-client.js'

export interface DepsPatchToolOptions {
  readonly prClient: PrClient
  readonly baseBranch?: string
}

const DepsPatchInputSchema = z.object({
  package: z.string(),
  currentVersion: z.string(),
  fixedVersion: z.string(),
  dependencyFilePath: z.string(),
  dependencyFileContent: z.string(),
  findingSummary: z.string(),
})
export type DepsPatchInput = z.infer<typeof DepsPatchInputSchema>

const DepsPatchOutputSchema = z.object({ prUrl: z.string(), prNumber: z.number() })
export type DepsPatchOutput = z.infer<typeof DepsPatchOutputSchema>

function buildPrBody(input: DepsPatchInput): string {
  return [
    `Bumps \`${input.package}\` from \`${input.currentVersion}\` to \`${input.fixedVersion}\`.`,
    '',
    '## Pourquoi',
    input.findingSummary,
    '',
    '## Vérification',
    'Les tests existants sont joués par la CI sur cette PR — aucune modification directe n’a été faite.',
  ].join('\n')
}

/**
 * `deps.patch` — "Le correctif est une PR, jamais une modification
 * directe." `execute` never touches the branch it targets; it computes the
 * new file content and hands it to `PrClient.open`, which is the only
 * thing that can actually reach GitHub (or whichever forge). `reversible:
 * true` — `revert` closes the PR without merging it, the only safe
 * "undo" of having proposed a change. Autonomy default for this tool is
 * `propose` (set on the agent declaration, not here) — a patch always
 * waits for a human, `deps.scan` is the only autonomous step.
 */
export function createDepsPatchTool(
  options: DepsPatchToolOptions,
): ToolDefinition<DepsPatchInput, DepsPatchOutput> {
  return defineTool({
    name: 'deps.patch',
    version: '1.0.0',
    description:
      'Opens a pull request bumping one dependency to a fixed version — never modifies anything directly.',
    input: DepsPatchInputSchema,
    output: DepsPatchOutputSchema,
    permissions: ['deps.patch'],
    sideEffects: true,
    reversible: true,
    cost: 'medium',
    async execute(input) {
      const updatedContent = bumpDependencyVersion(
        input.dependencyFileContent,
        input.package,
        input.fixedVersion,
      )
      const result = await options.prClient.open({
        baseBranch: options.baseBranch ?? 'main',
        branchName: `security/${input.package}-${input.fixedVersion}`,
        title: `security: bump ${input.package} to ${input.fixedVersion}`,
        body: buildPrBody(input),
        files: [{ path: input.dependencyFilePath, content: updatedContent }],
      })
      return { prUrl: result.url, prNumber: result.number }
    },
    async revert(receipt) {
      await options.prClient.close(receipt.prNumber)
    },
  })
}
