import { authHeader, request } from './http.js'

/**
 * `/api/scheduled-tasks` — the "Tâches planifiées" screen (fiche 28 task 2).
 * Shapes hand-mirrored from `@cogenta/api`'s `scheduled-tasks-router.ts` and
 * `@cogenta/schema`'s `registry.ts`.
 */

export type TaskTrigger = 'schedule' | 'manual' | 'cron'
export type TaskOutcome = 'success' | 'error'

export interface ScheduledTaskRun {
  readonly id: string
  readonly taskName: string
  readonly startedAt: number
  readonly finishedAt: number
  readonly durationMs: number
  readonly outcome: TaskOutcome
  readonly summary: string | null
  readonly error: string | null
  readonly triggeredBy: TaskTrigger
  readonly actor: string | null
}

export interface ScheduledTaskState {
  readonly name: string
  readonly description: string
  readonly intervalMs: number
  readonly destructive: boolean
  readonly lastRun: ScheduledTaskRun | null
  readonly nextRunAt: number
  readonly overdue: boolean
  readonly recentRuns: readonly ScheduledTaskRun[]
}

export type SchedulerMode = 'internal' | 'external-cron'

export type QueueJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface QueueJob {
  readonly id: string
  readonly status: QueueJobStatus
  readonly [key: string]: unknown
}

export function listScheduledTasks(
  token: string,
): Promise<{ readonly mode: SchedulerMode; readonly tasks: readonly ScheduledTaskState[] }> {
  return request('/api/scheduled-tasks', { headers: authHeader(token) })
}

export function readScheduledTask(token: string, name: string): Promise<ScheduledTaskState> {
  return request(`/api/scheduled-tasks/${encodeURIComponent(name)}`, {
    headers: authHeader(token),
  })
}

export function runScheduledTaskNow(token: string, name: string): Promise<ScheduledTaskRun> {
  return request(`/api/scheduled-tasks/${encodeURIComponent(name)}/run`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function listScheduledTaskQueue(
  token: string,
  status?: QueueJobStatus,
): Promise<{ readonly jobs: readonly QueueJob[] }> {
  const query = status === undefined ? '' : `?status=${encodeURIComponent(status)}`
  return request(`/api/scheduled-tasks/queue${query}`, { headers: authHeader(token) })
}

export function retryScheduledTaskJob(
  token: string,
  id: string,
): Promise<{ readonly retried: boolean }> {
  return request(`/api/scheduled-tasks/queue/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
    headers: authHeader(token),
  })
}
