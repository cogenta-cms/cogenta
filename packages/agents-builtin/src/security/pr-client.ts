export interface PrFile {
  readonly path: string
  readonly content: string
}

export interface OpenPrOptions {
  readonly baseBranch: string
  readonly branchName: string
  readonly title: string
  readonly body: string
  readonly files: readonly PrFile[]
}

export interface PrResult {
  readonly url: string
  readonly number: number
}

/**
 * "Le correctif est une PR avec les tests joués, jamais une modification
 * directe." One structural capability — open a branch, commit the given
 * files, open a PR — hides whichever concrete forge (GitHub, GitLab, a
 * self-hosted one) actually implements it, the same reasoning
 * `ContentServiceLike` (L4 task 5) and `EmbeddingProvider` (L4 task 14) use:
 * `deps.patch` depends on this capability, not on GitHub's REST API shape.
 * A real GitHub-backed implementation is a separate concern from this tool.
 */
export interface PrClient {
  open(options: OpenPrOptions): Promise<PrResult>
  /** The `revert` half — closing the PR without merging it. */
  close(prNumber: number): Promise<void>
}
