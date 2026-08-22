import { defineTool, type ToolDefinition } from '@cogenta/agents'
import { z } from 'zod'
import type { PrClient } from '../security/pr-client.js'

export interface CodePatchToolOptions {
  readonly prClient: PrClient
  readonly baseBranch?: string
}

const ChangedFileSchema = z.object({
  /** Repo-relative path, e.g. "packages/blocks/src/hero.ts". Never absolute — a tool has no filesystem of its own, only what `PrClient` commits. */
  path: z.string(),
  content: z.string(),
})

const CodePatchInputSchema = z.object({
  /** Short, imperative summary — becomes the PR title prefix. */
  summary: z.string(),
  /** Why this change is being proposed, in the operator's own terms. */
  rationale: z.string(),
  /** Full new content for every file the patch touches — never a unified diff, so `PrClient.open` can commit it byte for byte with no merge logic of its own. */
  files: z.array(ChangedFileSchema).min(1),
  /** How this was (or should be) verified — the PR body always shows this so a human reviewer knows what the CI run and the manual check already covered. */
  testPlan: z.string(),
})
export type CodePatchInput = z.infer<typeof CodePatchInputSchema>

const CodePatchOutputSchema = z.object({ prUrl: z.string(), prNumber: z.number() })
export type CodePatchOutput = z.infer<typeof CodePatchOutputSchema>

function buildPrBody(input: CodePatchInput): string {
  return [
    input.rationale,
    '',
    '## Files changed',
    ...input.files.map((f) => `- \`${f.path}\``),
    '',
    '## Test plan',
    input.testPlan,
    '',
    '---',
    'Proposed by the Cogenta Developer agent. Nothing here was applied directly — this ' +
      'pull request is the only artefact this run produced; a human review and merge ' +
      'is what actually changes the codebase.',
  ].join('\n')
}

/**
 * `code.patch` (`tools@1.3`, docs/04-contrats.md) — the Cogenta Developer
 * agent's only way to change the codebase, and it does not change the
 * codebase: it opens a pull request. Deliberately built the same way
 * `security`'s `deps.patch` (`deps-patch-tool.ts`) already is, reusing the
 * exact same `PrClient` capability rather than inventing a second "how do I
 * reach a forge" abstraction — the only new surface here is this tool's own
 * input/output shape (a general set of file contents instead of one
 * dependency-file bump) and the `code.patch` permission it declares.
 *
 * `reversible: true` — `revert` closes the PR without merging it, same
 * meaning as `deps.patch`'s. `sideEffects: true` plus `reversible: true` is
 * exactly what keeps this out of `withAutonomy`'s forced-approval path
 * (`packages/agents/src/autonomy/with-autonomy.ts`) — the tool is still
 * gated, but by the *configured* autonomy level, which `developerAgent`
 * pins to `propose` and never overrides. Nothing in this file grants
 * `autonomous`; only a site operator editing the stored agent could, and
 * that is the same "the safeguard is what does not appear here" reasoning
 * `security/agent.ts` documents for `deps.patch`.
 */
export function createCodePatchTool(
  options: CodePatchToolOptions,
): ToolDefinition<CodePatchInput, CodePatchOutput> {
  return defineTool({
    name: 'code.propose_patch',
    version: '1.0.0',
    description:
      'Opens a pull request with a real code change (one or more full file contents) — never writes to the repository directly.',
    input: CodePatchInputSchema,
    output: CodePatchOutputSchema,
    permissions: ['code.patch'],
    sideEffects: true,
    reversible: true,
    cost: 'medium',
    async execute(input) {
      const branchSuffix = input.summary
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
      const result = await options.prClient.open({
        baseBranch: options.baseBranch ?? 'main',
        branchName: `agent/developer/${branchSuffix || 'patch'}`,
        title: `feat: ${input.summary}`,
        body: buildPrBody(input),
        files: input.files.map((f) => ({ path: f.path, content: f.content })),
      })
      return { prUrl: result.url, prNumber: result.number }
    },
    async revert(receipt) {
      await options.prClient.close(receipt.prNumber)
    },
  })
}
