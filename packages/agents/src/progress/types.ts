/**
 * Fiche feedback — a real, user-reported gap: a long-running agent call
 * (a chat turn with tool calls, a theme generation with several candidates
 * running in parallel) gave no sign of life until it finished or timed out
 * ("je ne sais pas si le traitement est en cours ou pas"). This is the one
 * shape every long-running call in this package reports through — a plain
 * side-effecting callback, never a condition anything branches on, so a
 * caller with nothing to show progress to (a CLI script, a test) can pass
 * nothing and the run behaves exactly as it always has.
 */
export interface ProgressReporter {
  report(message: string): void
}

/** The reporter every long-running function defaults to when its caller supplies none — reporting nowhere is free. */
export const NOOP_PROGRESS: ProgressReporter = { report: () => undefined }

/** One reported line, timestamped by the job store that received it — the shape a polling client actually reads. */
export interface ProgressEvent {
  readonly at: number
  readonly message: string
}
