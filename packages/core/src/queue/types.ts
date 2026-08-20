export type JobId = string

export const JOB_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export interface EnqueueOptions {
  readonly name: string
  readonly payload?: unknown
  /** Epoch milliseconds. A job is invisible until then. */
  readonly runAt?: number
  /** Higher runs first. Ties break by `runAt`, then by insertion order. */
  readonly priority?: number
  readonly maxAttempts?: number
}

export interface Job<TPayload = unknown> {
  readonly id: JobId
  readonly name: string
  readonly payload: TPayload
  readonly attempt: number
  readonly maxAttempts: number
}

export interface JobState {
  readonly id: JobId
  readonly name: string
  readonly status: JobStatus
  readonly attempt: number
  readonly maxAttempts: number
  readonly runAt: number
  readonly lastError: string | undefined
}

export type JobHandler<TPayload = unknown> = (job: Job<TPayload>) => Promise<void>

export interface ListJobsOptions {
  /** Narrows to one status. Absent lists every status. */
  readonly status?: JobStatus
  /** Most recently touched first. Defaults to 50. */
  readonly limit?: number
}

export interface QueueDriver {
  enqueue(options: EnqueueOptions): Promise<JobId>
  /** Registers the handler for a job name. One handler per name. */
  process<TPayload = unknown>(name: string, handler: JobHandler<TPayload>): void
  /**
   * Runs one batch of due jobs and returns how many were handled.
   *
   * The degraded driver has no worker of its own: something has to call this —
   * a system cron on shared hosting, a loop in a long-lived process elsewhere.
   * That is why it is on the interface rather than hidden inside a driver.
   */
  tick(): Promise<number>
  cancel(id: JobId): Promise<void>
  status(id: JobId): Promise<JobState | null>
  /**
   * Lists jobs, most recently touched first — what fiche 28's admin screen
   * shows as "pending / running / failed" in its queue section.
   */
  list(options?: ListJobsOptions): Promise<readonly JobState[]>
  /**
   * Puts a `failed` job back to `pending` so the next `tick()` picks it up
   * again, with its attempt counter reset. `false` for a job that is not
   * `failed` (already retried, already gone, still running) — a no-op, not
   * an error, since two admins clicking "retry" on the same job at once must
   * not throw for the one who lost the race.
   */
  retry(id: JobId): Promise<boolean>
  close(): Promise<void>
}

export interface QueueConfig {
  readonly driver?: string
  readonly url?: string | undefined
}

export interface QueueDriverOptions {
  /** Injected so scheduling and lease expiry are testable without waiting. */
  readonly now?: () => number
  /**
   * How long a claimed job may run before another worker may take it over.
   * A worker that is killed mid-job must not hold its job forever.
   */
  readonly leaseMs?: number
  /** Jobs claimed per `tick`. */
  readonly batchSize?: number
}
