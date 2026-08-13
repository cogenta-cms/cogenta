import type { ErrorCode } from './codes.js'

export interface CogentaErrorOptions {
  /** Stable, machine-readable code. Never derived from the message. */
  readonly code: ErrorCode
  /** What failed and why, in one sentence, aimed at a human. */
  readonly message: string
  /** What the user should do about it. Required for anything a user can hit. */
  readonly hint?: string
  /** The underlying error, kept for debugging. */
  readonly cause?: unknown
  /**
   * Structured context for logs. Opt-in per call site, which is what keeps
   * secrets out of it: nothing is ever copied here automatically (rule R7).
   */
  readonly details?: Readonly<Record<string, unknown>>
}

export interface SerialisedCogentaError {
  readonly name: 'CogentaError'
  readonly code: ErrorCode
  readonly message: string
  readonly hint: string | undefined
  readonly details: Readonly<Record<string, unknown>> | undefined
}

/**
 * The only error class library code throws. A bare `throw new Error("…")` is
 * forbidden in Cogenta: it gives the caller nothing to branch on and the user
 * nothing to act on.
 */
export class CogentaError extends Error {
  readonly code: ErrorCode
  readonly hint: string | undefined
  readonly details: Readonly<Record<string, unknown>> | undefined

  constructor(options: CogentaErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'CogentaError'
    this.code = options.code
    this.hint = options.hint
    this.details = options.details
  }

  /** Structured form for logging. The stack is deliberately left out. */
  toJSON(): SerialisedCogentaError {
    return {
      name: 'CogentaError',
      code: this.code,
      message: this.message,
      hint: this.hint,
      details: this.details,
    }
  }
}

export function isCogentaError(value: unknown): value is CogentaError {
  return value instanceof CogentaError
}
