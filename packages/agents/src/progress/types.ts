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
  report(message: string, detail?: ProgressDetail): void
}

/**
 * What a progress line *is*, alongside what it says.
 *
 * Added because the admin was reading `message` with a regular expression to
 * decide whether a line meant "thinking", "a tool ran" or "a tool failed" —
 * a UI guessing at English prose produced by another package, which breaks
 * the day a message is reworded or translated. Optional on purpose: every
 * existing `report(message)` call still compiles and still behaves the same,
 * and a consumer that receives no detail is expected to degrade to showing
 * the plain line rather than to fail.
 */
export interface ProgressDetail {
  readonly kind: 'thinking' | 'tool-call' | 'tool-ok' | 'tool-failed' | 'stage' | 'warning'
  /** The tool this line is about, when it is about one — never parsed back out of the message. */
  readonly tool?: string
}

/** The reporter every long-running function defaults to when its caller supplies none — reporting nowhere is free. */
export const NOOP_PROGRESS: ProgressReporter = { report: () => undefined }

/** One reported line, timestamped by the job store that received it — the shape a polling client actually reads. */
export interface ProgressEvent {
  readonly at: number
  readonly message: string
  /** Absent for a line reported before this was carried, or by a reporter that supplies none. */
  readonly kind?: ProgressDetail['kind']
  readonly tool?: string
}
