import type { DiffEntry } from '../reversibility/diff.js'

/**
 * "Un agent peut être exécuté contre une copie du site, en lecture réelle et
 * écriture simulée, avec production des diffs qu'il aurait appliqués."
 */
export interface SandboxCallResult {
  /**
   * `true` when the write genuinely ran, against the copy, and was
   * immediately undone via the tool's own `revert()` — a real dry run, not
   * a guess. `false` when the tool has no `revert()`: there is no safe way
   * to undo it on the copy, so it was never called at all, not even once.
   */
  readonly simulated: boolean
  /** The tool's own output from the reverted call — present only when `simulated` is `true`. */
  readonly wouldHaveApplied?: unknown
  /** `diffValues(before, after)` around the reverted call — present only when both a `snapshot()` was supplied and `simulated` is `true`. */
  readonly diff?: readonly DiffEntry[]
  readonly note: string
}
