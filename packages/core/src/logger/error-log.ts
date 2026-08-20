import { randomUUID } from 'node:crypto'
import { isCogentaError } from '../errors/index.js'
import { redact } from './redact.js'

/**
 * The server error journal (fiche 24 task 4).
 *
 * A bounded, in-process ring buffer — not a table. Durability across a
 * restart is not the point: the point is answering "what just went wrong on
 * this 500" from the admin, on a shared host with no access to the process's
 * own stdout. Bounding it ("the N last entries, not everything") is what
 * "purgées" means here — the oldest entry is simply the one a new one
 * evicts, so nothing needs a separate sweep.
 *
 * Every field passes through `redact()` before it is stored, exactly like
 * every other structured log record (rule R7, `AGENTS.md` § Logs) — this is
 * not a second, weaker guarantee, it is the same one applied a second time
 * so a caller that builds an entry by hand (not through `Logger.error`)
 * cannot skip it.
 */

export interface ErrorLogEntry {
  readonly id: string
  readonly at: string
  /** A stable `ErrorCode` when the failure is one of ours, `'INTERNAL'` otherwise. */
  readonly code: string
  readonly message: string
  readonly trace: string | undefined
  /** Free-form context — request path, method — redacted the same as everything else. */
  readonly context: Readonly<Record<string, unknown>> | undefined
}

export interface RecordErrorInput {
  readonly code?: string
  readonly message: string
  readonly trace?: string
  readonly context?: Readonly<Record<string, unknown>>
}

export interface ErrorLog {
  record(input: RecordErrorInput): ErrorLogEntry
  /** Turns a thrown value into an entry, using its `CogentaError` code when it has one. */
  recordError(error: unknown, context?: Readonly<Record<string, unknown>>): ErrorLogEntry
  /** Newest first. */
  entries(): readonly ErrorLogEntry[]
  clear(): void
}

export interface ErrorLogOptions {
  /** How many entries survive at once. The (N+1)th record evicts the oldest. */
  readonly capacity?: number
  readonly now?: () => Date
  readonly newId?: () => string
}

const DEFAULT_CAPACITY = 200

export function createErrorLog(options: ErrorLogOptions = {}): ErrorLog {
  const capacity = options.capacity ?? DEFAULT_CAPACITY
  const now = options.now ?? ((): Date => new Date())
  const newId = options.newId ?? randomUUID

  let buffer: ErrorLogEntry[] = []

  function record(input: RecordErrorInput): ErrorLogEntry {
    const safe = redact({
      message: input.message,
      trace: input.trace ?? null,
      context: input.context ?? null,
    })
    const entry: ErrorLogEntry = {
      id: newId(),
      at: now().toISOString(),
      code: input.code ?? 'INTERNAL',
      message: String(safe['message']),
      trace: typeof safe['trace'] === 'string' ? safe['trace'] : undefined,
      context:
        safe['context'] !== null && typeof safe['context'] === 'object'
          ? (safe['context'] as Readonly<Record<string, unknown>>)
          : undefined,
    }
    buffer.unshift(entry)
    if (buffer.length > capacity) buffer = buffer.slice(0, capacity)
    return entry
  }

  function recordError(error: unknown, context?: Readonly<Record<string, unknown>>): ErrorLogEntry {
    if (isCogentaError(error)) {
      return record({
        code: error.code,
        message: error.message,
        ...(error.stack === undefined ? {} : { trace: error.stack }),
        ...(context === undefined ? {} : { context }),
      })
    }
    const trace = error instanceof Error ? error.stack : undefined
    return record({
      code: 'INTERNAL',
      message: error instanceof Error ? error.message : String(error),
      ...(trace === undefined ? {} : { trace }),
      ...(context === undefined ? {} : { context }),
    })
  }

  return {
    record,
    recordError,
    entries: () => buffer,
    clear: () => {
      buffer = []
    },
  }
}
