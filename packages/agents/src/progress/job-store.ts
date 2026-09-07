import { newId as generateId, type Logger } from '@cogenta/core'
import type { ProgressEvent, ProgressReporter } from './types.js'

/**
 * The REST layer this backs (`agents-router.ts`'s conversation-message job,
 * `theme-router.ts`'s generate job) is deliberately "a plain value in, a
 * plain value out" (`packages/api/src/rest/http.ts`'s own doc comment) —
 * no streaming response exists in that abstraction, on purpose, so every
 * route stays testable without a live server. Live progress therefore has
 * to be a poll, not a push: a client starts a job, gets an id back
 * immediately, and polls `get(id)` for the growing event log until
 * `status` leaves `'running'`.
 *
 * In-memory and per-process, like `createMemoryApprovalQueue` — this is
 * not `@cogenta/core`'s `queue` module (durable, retried, meant to survive
 * a restart): a progress job is watched by one open browser tab for the
 * seconds-to-a-minute a generation takes, and a `cogenta serve` restart
 * mid-run losing it is an acceptable, honest trade for not needing a
 * database row per keystroke of progress.
 */

export type JobStatus = 'running' | 'done' | 'failed'

export interface JobRecord<TResult> {
  readonly id: string
  readonly status: JobStatus
  readonly events: readonly ProgressEvent[]
  readonly result?: TResult
  readonly error?: { readonly message: string }
}

export interface ProgressJobStore<TResult> {
  /** Starts `run` immediately (never awaited by the caller) and returns the new job's id right away. */
  start(run: (reporter: ProgressReporter) => Promise<TResult>): string
  /** `undefined` for an id that was never issued, already swept, or simply wrong. */
  get(id: string): JobRecord<TResult> | undefined
}

const DEFAULT_RETAIN_MS = 5 * 60_000

export function createProgressJobStore<TResult>(options?: {
  readonly newId?: () => string
  readonly now?: () => number
  /** How long a finished job's record survives for a last poll to see it — default 5 minutes. */
  readonly retainMs?: number
  /**
   * A failed job is always visible to whoever is polling it (`error.message`
   * on the job record, already shown by the admin UI) — this is the other
   * half: a structured `logger.error(...)` line so a failure is traceable
   * server-side too, for a run nobody happened to be watching live. Omitted
   * in a caller that has no logger to hand (e.g. a unit test).
   */
  readonly logger?: Logger
}): ProgressJobStore<TResult> {
  const makeId = options?.newId ?? generateId
  const now = options?.now ?? Date.now
  const retainMs = options?.retainMs ?? DEFAULT_RETAIN_MS
  const logger = options?.logger

  interface MutableRecord {
    status: JobStatus
    events: ProgressEvent[]
    result?: TResult
    error?: { readonly message: string }
  }

  const records = new Map<string, MutableRecord>()

  function snapshot(id: string, record: MutableRecord): JobRecord<TResult> {
    return {
      id,
      status: record.status,
      events: record.events,
      ...(record.result === undefined ? {} : { result: record.result }),
      ...(record.error === undefined ? {} : { error: record.error }),
    }
  }

  return {
    start(run) {
      const id = makeId()
      const record: MutableRecord = { status: 'running', events: [] }
      records.set(id, record)

      const reporter: ProgressReporter = {
        report(message) {
          record.events.push({ at: now(), message })
        },
      }

      run(reporter).then(
        (result) => {
          record.status = 'done'
          record.result = result
          setTimeout(() => records.delete(id), retainMs).unref?.()
        },
        (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          record.status = 'failed'
          record.error = { message }
          logger?.error('progress job failed', { jobId: id, error: message })
          setTimeout(() => records.delete(id), retainMs).unref?.()
        },
      )

      return id
    },
    get(id) {
      const record = records.get(id)
      return record === undefined ? undefined : snapshot(id, record)
    },
  }
}
