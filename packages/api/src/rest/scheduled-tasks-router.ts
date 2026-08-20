import { CogentaError, type JobId, type JobState, type QueueDriver } from '@cogenta/core'
import type { ScheduledTaskRegistry } from '@cogenta/schema'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `GET /api/scheduled-tasks`, `GET /api/scheduled-tasks/{name}`, `POST
 * /api/scheduled-tasks/{name}/run`, `GET /api/scheduled-tasks/queue` and
 * `POST /api/scheduled-tasks/queue/{id}/retry` — fiche 28's admin screen.
 *
 * Same shape as `createToolsRouter` and `createOpsStatusRouter`: admin-only,
 * a thin read-through onto state something else already owns
 * (`ScheduledTaskRegistry`, the maintenance `QueueDriver`), no business
 * logic of its own. "Exécuter maintenant" is journalled by the caller — this
 * router does not write to the audit log itself, since it has no audit
 * store to write to; `onManualRun` is the seam `cogenta serve` uses to do
 * that, given the run this router already produced.
 */

export interface ScheduledTasksRouterOptions {
  readonly registry: ScheduledTaskRegistry
  /** The maintenance job queue (fiche 24's `toolsQueue`) — the "file" section of the screen. Absent means the section is empty rather than erroring. */
  readonly queue?: QueueDriver
  /** `cogenta.config.mjs`'s `scheduler.mode` — which clock is expected to be driving `tick()`. */
  readonly mode: 'internal' | 'external-cron'
  /**
   * Called after a manual run completes, successful or not — the hook
   * `cogenta serve` uses to write the audit entry fiche 28's "«exécuter
   * maintenant» journalisé" criterion asks for. Never awaited by the route's
   * own response: a slow audit write must not make "run now" hang.
   */
  readonly onManualRun?: (run: {
    readonly taskName: string
    readonly outcome: 'success' | 'error'
    readonly actorId: string | null
  }) => void
  readonly basePath?: string
}

export interface ScheduledTasksRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/scheduled-tasks'

function forbidden(context: AccessContext, what: string): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: `Access denied: ${what} can only be used by the admin role.`,
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext, what: string): void {
  if (context.actor.roles.includes('admin')) return
  throw forbidden(context, what)
}

function unknownJob(id: string): CogentaError {
  return new CogentaError({
    code: 'SCHEDULER_QUEUE_JOB_NOT_FOUND',
    message: `No queued job "${id}", or it is not currently "failed".`,
    hint: 'Only a failed job can be retried. Check GET /api/scheduled-tasks/queue for its current status.',
    details: { id },
  })
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint:
      'The scheduled-task routes are GET /api/scheduled-tasks, GET /api/scheduled-tasks/{name}, ' +
      'POST /api/scheduled-tasks/{name}/run, GET /api/scheduled-tasks/queue and ' +
      'POST /api/scheduled-tasks/queue/{id}/retry.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function parseJobStatus(value: string | undefined): JobState['status'] | undefined {
  if (value === undefined) return undefined
  const statuses: readonly JobState['status'][] = [
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
  ]
  return statuses.includes(value as JobState['status']) ? (value as JobState['status']) : undefined
}

export function createScheduledTasksRouter(
  options: ScheduledTasksRouterOptions,
): ScheduledTasksRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)
  const queuePath = `${basePath}/queue`
  const runSuffix = new RegExp(`^${escapeForRegExp(basePath)}/([^/]+)/run$`, 'u')
  const queueRetrySuffix = new RegExp(`^${escapeForRegExp(queuePath)}/([^/]+)/retry$`, 'u')
  const taskPath = new RegExp(`^${escapeForRegExp(basePath)}/([^/]+)$`, 'u')

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        return await route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function route(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const [rawPath, query] = request.path.split('?')
    const path = normalise(rawPath ?? request.path)
    const method = request.method.toUpperCase()

    if (path === basePath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the scheduled tasks')
      const tasks = await options.registry.list()
      return jsonResponse(200, { data: { mode: options.mode, tasks } })
    }

    if (path === queuePath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the maintenance job queue')
      if (options.queue === undefined) return jsonResponse(200, { data: { jobs: [] } })
      const params = new URLSearchParams(query ?? '')
      const status = parseJobStatus(params.get('status') ?? undefined)
      const jobs = await options.queue.list(status === undefined ? {} : { status })
      return jsonResponse(200, { data: { jobs } })
    }

    const retryMatch = queueRetrySuffix.exec(path)
    if (retryMatch !== null) {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      assertAdmin(context, 'retrying a queued job')
      const id = decodeURIComponent(retryMatch[1] as string) as JobId
      if (options.queue === undefined) throw unknownJob(id)
      const retried = await options.queue.retry(id)
      if (!retried) throw unknownJob(id)
      return jsonResponse(200, { data: { retried: true } })
    }

    const runMatch = runSuffix.exec(path)
    if (runMatch !== null) {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      assertAdmin(context, 'running a scheduled task')
      const name = decodeURIComponent(runMatch[1] as string)
      const run = await options.registry.runNow(name, { actor: context.actor.id })
      options.onManualRun?.({ taskName: name, outcome: run.outcome, actorId: context.actor.id })
      return jsonResponse(200, { data: run })
    }

    const taskMatch = taskPath.exec(path)
    if (taskMatch !== null) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'a scheduled task')
      const name = decodeURIComponent(taskMatch[1] as string)
      const state = await options.registry.get(name)
      if (state === null) {
        throw new CogentaError({
          code: 'SCHEDULER_TASK_UNKNOWN',
          message: `No scheduled task named "${name}" is registered.`,
          hint: 'Check the task name against GET /api/scheduled-tasks.',
          details: { name },
        })
      }
      return jsonResponse(200, { data: state })
    }

    throw noRoute()
  }
}
