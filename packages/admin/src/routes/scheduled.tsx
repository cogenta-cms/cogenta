import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  listScheduledTaskQueue,
  listScheduledTasks,
  type QueueJob,
  retryScheduledTaskJob,
  runScheduledTaskNow,
  type ScheduledTaskState,
  type SchedulerMode,
} from '../api/scheduled-tasks-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useLocalPagination } from '../lib/use-local-pagination.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Modal,
  Notice,
  Pagination,
  TableRoot,
} from '../ui/index.js'

/**
 * "Tâches planifiées" — fiche 28 task 2.
 *
 * A thin read-through onto `ScheduledTaskRegistry` and the maintenance
 * `QueueDriver`, the same shape as `HealthRoute`/`ToolsRoute` (fiche 24).
 * "Exécuter maintenant" on a `destructive` task (the trash sweep) asks for
 * confirmation first — the fiche's own named pitfall.
 *
 * The "File" section (fiche 67 task 3) pages client-side over a wider fetch
 * (`QUEUE_FETCH_LIMIT`) rather than a driver-level offset — see
 * `scheduled-tasks-router.ts`'s comment on `MAX_QUEUE_LIST_LIMIT` for why.
 */

const QUEUE_FETCH_LIMIT = 500
const PAGE_SIZE = 20

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function ScheduledRoute(): JSX.Element | null {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [mode, setMode] = useState<SchedulerMode | null>(null)
  const [tasks, setTasks] = useState<readonly ScheduledTaskState[]>([])
  const [jobs, setJobs] = useState<readonly QueueJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ScheduledTaskState | null>(null)
  const [lastResult, setLastResult] = useState<{
    readonly name: string
    readonly summary: string | null
    readonly error: string | null
  } | null>(null)

  const dateFormatter = useCallback(
    (ms: number): string =>
      new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(ms),
      ),
    [i18n.language],
  )

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    try {
      const [{ mode: schedulerMode, tasks: list }, { jobs: queued }] = await Promise.all([
        listScheduledTasks(token),
        listScheduledTaskQueue(token, { limit: QUEUE_FETCH_LIMIT }),
      ])
      setMode(schedulerMode)
      setTasks(list)
      setJobs(queued)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('scheduled.loadError'))
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const taskPagination = useLocalPagination(tasks, '', PAGE_SIZE)
  const queueJobs = [
    ...jobs.filter((job) => job.status === 'pending' || job.status === 'running'),
    ...jobs.filter((job) => job.status === 'failed'),
  ]
  const queuePagination = useLocalPagination(queueJobs, '', PAGE_SIZE)

  if (token === null) return null
  if (!isAdmin) {
    return (
      <section aria-labelledby="scheduled-heading" className="flex flex-col gap-4">
        <h1 id="scheduled-heading">{t('scheduled.heading')}</h1>
        <p role="alert">{t('common.adminPageOnly')}</p>
      </section>
    )
  }

  async function runTask(task: ScheduledTaskState): Promise<void> {
    if (token === null) return
    setError(null)
    setRunning(task.name)
    try {
      const run = await runScheduledTaskNow(token, task.name)
      setLastResult({ name: task.name, summary: run.summary, error: run.error })
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('scheduled.runError'))
    } finally {
      setRunning(null)
    }
  }

  function requestRun(task: ScheduledTaskState): void {
    if (task.destructive) {
      setConfirmTarget(task)
      return
    }
    void runTask(task)
  }

  async function retryJob(id: string): Promise<void> {
    if (token === null) return
    setError(null)
    try {
      await retryScheduledTaskJob(token, id)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('scheduled.retryError'))
    }
  }

  const visibleActiveJobs = queuePagination.items.filter(
    (job) => job.status === 'pending' || job.status === 'running',
  )
  const visibleFailedJobs = queuePagination.items.filter((job) => job.status === 'failed')

  return (
    <section aria-labelledby="scheduled-heading" className="flex flex-col gap-6">
      <h1 id="scheduled-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
        {t('scheduled.heading')}
      </h1>
      <p className="m-0 text-sm text-muted-foreground">
        {mode === 'external-cron' ? t('scheduled.modeExternal') : t('scheduled.modeInternal')}
      </p>

      {error !== null && (
        <Notice tone="danger" title={t('scheduled.errorTitle')}>
          {error}
        </Notice>
      )}

      {lastResult !== null && (
        <Notice
          tone={lastResult.error === null ? 'success' : 'danger'}
          live="polite"
          title={t('scheduled.lastResultTitle', { name: lastResult.name })}
        >
          {lastResult.error ?? lastResult.summary ?? t('scheduled.noSummary')}
        </Notice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="scheduled-tasks-heading">{t('scheduled.tasksHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <TableRoot
            label={t('scheduled.tasksHeading')}
            className="min-w-0 max-w-full overflow-x-auto"
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col">{t('scheduled.columnTask')}</th>
                  <th scope="col">{t('scheduled.columnLastRun')}</th>
                  <th scope="col">{t('scheduled.columnDuration')}</th>
                  <th scope="col">{t('scheduled.columnResult')}</th>
                  <th scope="col">{t('scheduled.columnNextRun')}</th>
                  <th scope="col">{t('scheduled.columnActions')}</th>
                </tr>
              </thead>
              <tbody>
                {taskPagination.items.map((task) => (
                  <tr key={task.name}>
                    <th scope="row" className="font-sans font-normal normal-case tracking-normal">
                      <span className="font-medium">
                        {t(`scheduled.taskName.${task.name}`, { defaultValue: task.description })}
                      </span>
                      {task.overdue && (
                        <span
                          role="status"
                          className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive"
                        >
                          {t('scheduled.overdue')}
                        </span>
                      )}
                    </th>
                    <td>
                      {task.lastRun === null
                        ? t('scheduled.never')
                        : dateFormatter(task.lastRun.startedAt)}
                    </td>
                    <td>{task.lastRun === null ? '—' : formatDuration(task.lastRun.durationMs)}</td>
                    <td>
                      {task.lastRun === null
                        ? '—'
                        : t(
                            task.lastRun.outcome === 'success'
                              ? 'scheduled.outcomeSuccess'
                              : 'scheduled.outcomeError',
                          )}
                    </td>
                    <td>{dateFormatter(task.nextRunAt)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={running === task.name}
                        aria-label={
                          running === task.name
                            ? `${t('scheduled.running')} : ${t(`scheduled.taskName.${task.name}`, { defaultValue: task.description })}`
                            : t('scheduled.runTaskAction', {
                                name: t(`scheduled.taskName.${task.name}`, {
                                  defaultValue: task.description,
                                }),
                              })
                        }
                        onClick={() => requestRun(task)}
                      >
                        {running === task.name ? t('scheduled.running') : t('scheduled.runButton')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRoot>
          {taskPagination.pageCount > 1 && (
            <nav aria-label={t('scheduled.taskPagination')}>
              <Pagination
                variant="pages"
                page={taskPagination.page}
                pageCount={taskPagination.pageCount}
                onPageChange={taskPagination.onPageChange}
                previousLabel={t('lists.previous')}
                nextLabel={t('lists.next')}
                pageInfo={t('lists.pageInfo', {
                  from: taskPagination.start + 1,
                  to: taskPagination.start + taskPagination.items.length,
                  total: taskPagination.total,
                })}
              />
            </nav>
          )}
        </CardBody>
      </Card>

      <Card aria-labelledby="scheduled-queue-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="scheduled-queue-heading">{t('scheduled.queueHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {jobs.length >= QUEUE_FETCH_LIMIT && (
            <p className="m-0 text-sm text-muted-foreground">
              {t('scheduled.queueWindowNotice', { count: QUEUE_FETCH_LIMIT })}
            </p>
          )}
          {queueJobs.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{t('scheduled.queueEmpty')}</p>
          ) : (
            <>
              <ul className="m-0 flex flex-col gap-1 pl-0 list-none text-sm">
                {visibleActiveJobs.map((job) => (
                  <li key={job.id} className="break-words [overflow-wrap:anywhere]">
                    {job.id} — {t(`scheduled.jobStatus.${job.status}`)}
                  </li>
                ))}
                {visibleFailedJobs.map((job) => (
                  <li key={job.id} className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                      {job.id} — {t('scheduled.jobStatus.failed')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('scheduled.retryJobAction', { id: job.id })}
                      onClick={() => void retryJob(job.id)}
                    >
                      {t('scheduled.retryButton')}
                    </Button>
                  </li>
                ))}
              </ul>
              {queuePagination.pageCount > 1 && (
                <nav aria-label={t('scheduled.queuePagination')}>
                  <Pagination
                    variant="pages"
                    page={queuePagination.page}
                    pageCount={queuePagination.pageCount}
                    onPageChange={queuePagination.onPageChange}
                    previousLabel={t('scheduled.previousPage')}
                    nextLabel={t('scheduled.nextPage')}
                    pageInfo={t('scheduled.queuePageInfo', {
                      from: queueJobs.length === 0 ? 0 : queuePagination.start + 1,
                      to: queuePagination.start + queuePagination.items.length,
                      total: queueJobs.length,
                    })}
                  />
                </nav>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card aria-labelledby="scheduled-content-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="scheduled-content-heading">{t('scheduled.contentHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p className="m-0 text-sm text-muted-foreground">
            {t('scheduled.contentBody')}{' '}
            <Link to="/" className="underline">
              {t('scheduled.contentLink')}
            </Link>
          </p>
        </CardBody>
      </Card>

      {confirmTarget !== null && (
        <Modal
          open={true}
          onOpenChange={(open) => {
            if (!open) setConfirmTarget(null)
          }}
          title={t('scheduled.confirmTitle', {
            name: t(`scheduled.taskName.${confirmTarget.name}`, {
              defaultValue: confirmTarget.description,
            }),
          })}
          closeLabel={t('common.cancel')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmTarget(null)}>
                {t('scheduled.confirmCancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const target = confirmTarget
                  setConfirmTarget(null)
                  void runTask(target)
                }}
              >
                {t('scheduled.confirmRun')}
              </Button>
            </>
          }
        >
          <p>{t('scheduled.confirmBody')}</p>
        </Modal>
      )}
    </section>
  )
}
