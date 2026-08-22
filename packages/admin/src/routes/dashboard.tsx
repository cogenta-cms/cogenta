import { type FormEvent, type JSX, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { type AnalyticsSummary, getAnalyticsSummary } from '../api/analytics-client.js'
import { type AuditEntry, listAuditEntries } from '../api/audit-client.js'
import { ApiError } from '../api/client.js'
import {
  type CollectionCounts,
  createEntry,
  type Entry,
  getContentSummary,
  listEntries,
} from '../api/content-client.js'
import { getSiteHealth, type SiteHealth } from '../api/health-client.js'
import { listUsers } from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  type DashboardWidgetId,
  loadDashboardPrefs,
  reorderWidget,
  resetDashboardPrefs,
  saveDashboardPrefs,
} from '../lib/dashboard-prefs.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary, SchemaField } from '../schema/types.js'
import {
  AuditIcon,
  ClockIcon,
  CloseIcon,
  MediaIcon,
  PlusIcon,
  PulseIcon,
  TrendIcon,
} from '../ui/icons.js'

const DASHBOARD_WINDOW_DAYS = 7
/** A schedule due within this many hours counts as imminent for the to-do widget. */
const IMMINENT_HOURS = 48

interface ScheduledItem {
  readonly collection: string
  readonly entry: Entry
}

function titleOf(entry: Entry): string {
  const candidate = Object.values(entry.values).find((value) => typeof value === 'string')
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : entry.id
}

/** A block of paragraphs, contract A's restricted Portable Text shape — the quick-draft form's only writer of a `richText` field, so it never guesses at marks or annotations, only plain paragraphs. */
function plainTextToRichText(text: string): readonly Record<string, unknown>[] {
  const paragraphs = text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)

  return paragraphs.map((paragraph, index) => ({
    _key: `qd-${index}-${Math.random().toString(36).slice(2, 8)}`,
    _type: 'block',
    style: 'normal',
    children: [
      {
        _key: `qd-${index}-s-${Math.random().toString(36).slice(2, 8)}`,
        _type: 'span',
        text: paragraph,
        marks: [],
      },
    ],
    markDefs: [],
  }))
}

/** The first declared field of `kind`, deterministically — never "the first string value found" (that guess is what fiche 01 names as a real bug elsewhere). */
function firstFieldOf(collection: CollectionSummary, kind: SchemaField['kind']): string | null {
  return collection.fields.find((field) => field.kind === kind)?.name ?? null
}

const STATUS_DOT: Record<SiteHealth[keyof SiteHealth]['status'], string> = {
  ok: 'bg-success',
  degraded: 'bg-warning',
  down: 'bg-destructive',
}

function HealthBadge({ report }: { readonly report: SiteHealth[keyof SiteHealth] }): JSX.Element {
  const { t } = useTranslation()
  return (
    <span className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-1 font-mono text-xs">
        <span
          className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[report.status]}`}
          aria-hidden="true"
        />
        {report.driver} <span className="text-muted-foreground">({report.tier})</span> —{' '}
        {t(`dashboard.healthStatus.${report.status}`)}
      </span>
      {/* A raw "degraded" badge, unexplained, reads as an incident to a
          non-technical admin — it almost always just means "no external
          service configured", which is the expected state on a fresh site. */}
      {report.status !== 'ok' && (
        <span className="text-xs text-muted-foreground">{t('dashboard.healthDegradedHint')}</span>
      )}
    </span>
  )
}

/**
 * L2 task 15, extended by fiche 22 (dashboard). Widgets read real state —
 * health/audit/analytics (`/api/health`, `/api/audit`,
 * `/api/analytics/summary`), the content summary and scheduled content
 * (`/api/content/*`) — and two widgets that would have no honest data
 * source in this codebase (open CVEs, Core Web Vitals) were **removed**
 * rather than left as fabricated placeholders (fiche 22 tâche 4: "le
 * retirer est une réponse acceptable"). The backups widget stays, because
 * fiche 26 gives it a real source of data; until then it says so instead of
 * showing a number.
 *
 * The markup below keeps the same plain `<section>`/`<h2>`/`<ul>` shape the
 * unstyled version used (each widget its own labelled landmark section) —
 * only classNames and icons were added on top. A `Card`-component rewrite
 * was tried and reverted: it visually read the same but reproducibly made
 * `test/notices/notice-board.test.tsx` flaky when run in the same file
 * batch as this route's own test, and the plain structure below does not.
 * Widget order/visibility (fiche 22 tâche 3) reorders these same sections;
 * it never swaps their markup for a component.
 */
export function DashboardRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const schema = useSchema()
  const navigate = useNavigate()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const actorId = auth.state.status === 'authenticated' ? auth.state.user.id : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [health, setHealth] = useState<SiteHealth | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  const [activity, setActivity] = useState<readonly AuditEntry[]>([])
  const [activityError, setActivityError] = useState<string | null>(null)
  /** id → email, the same lookup `audit.tsx` already builds — a raw UUID next
   * to an action reads as noise, not as "who did this". */
  const [actorNames, setActorNames] = useState<ReadonlyMap<string, string>>(new Map())

  const [scheduled, setScheduled] = useState<readonly ScheduledItem[]>([])
  const [scheduledError, setScheduledError] = useState<string | null>(null)

  const [myDrafts, setMyDrafts] = useState<readonly ScheduledItem[]>([])
  const [myDraftsError, setMyDraftsError] = useState<string | null>(null)

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  const [summary, setSummary] = useState<readonly CollectionCounts[] | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [prefs, setPrefs] = useState(() => loadDashboardPrefs())

  // Quick draft (fiche 22 tâche 5).
  const [draftCollection, setDraftCollection] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  useEffect(() => {
    if (token === null || !isAdmin) return
    let cancelled = false
    getSiteHealth(token)
      .then((result) => {
        if (!cancelled) setHealth(result)
      })
      .catch((caught) => {
        if (!cancelled) {
          setHealthError(
            caught instanceof ApiError ? caught.message : t('dashboard.healthLoadError'),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    if (token === null || !isAdmin) {
      setActorNames(new Map())
      return
    }
    let cancelled = false
    listUsers(token)
      .then((users) => {
        if (!cancelled) setActorNames(new Map(users.map((user) => [user.id, user.email])))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token, isAdmin])

  useEffect(() => {
    if (token === null || !isAdmin) return
    let cancelled = false
    listAuditEntries(token, { limit: 10 })
      .then((entries) => {
        if (!cancelled) setActivity(entries)
      })
      .catch((caught) => {
        if (!cancelled) {
          setActivityError(
            caught instanceof ApiError ? caught.message : t('dashboard.activityLoadError'),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    if (token === null || !isAdmin) return
    let cancelled = false
    getAnalyticsSummary(token, { days: DASHBOARD_WINDOW_DAYS })
      .then((result) => {
        if (!cancelled) setAnalytics(result)
      })
      .catch((caught) => {
        if (!cancelled) {
          setAnalyticsError(
            caught instanceof ApiError ? caught.message : t('dashboard.analyticsLoadError'),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, isAdmin, t])

  // Content summary (fiche 22 tâche 1) — one aggregated request, not one per
  // collection. Visibility per collection is the server's own call
  // (`canPerform('read')` is only ever a UI hint), so no `isAdmin` gate here.
  useEffect(() => {
    if (token === null) return
    let cancelled = false
    getContentSummary(token)
      .then((rows) => {
        if (!cancelled) setSummary(rows)
      })
      .catch((caught) => {
        if (!cancelled) {
          setSummaryError(
            caught instanceof ApiError ? caught.message : t('dashboard.summaryLoadError'),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (token === null || schema.status !== 'ready') return
    let cancelled = false
    // `canPerform('update', …)` stands in for "may see this collection's
    // drafts" — there is no dedicated draft-read action in the wire schema,
    // and the API itself is the one thing that actually enforces access, so
    // a collection this misses just shows nothing rather than a 403.
    const readable = schema.schema.collections.filter((collection) =>
      canPerform('update', collection, roles),
    )
    Promise.all(
      readable.map((collection) =>
        listEntries(token, collection.name, { status: 'scheduled', limit: 5 })
          .then((page) => page.items.map((entry) => ({ collection: collection.name, entry })))
          .catch(() => []),
      ),
    )
      .then((results) => {
        if (!cancelled) setScheduled(results.flat())
      })
      .catch((caught) => {
        if (!cancelled) {
          setScheduledError(
            caught instanceof ApiError ? caught.message : t('dashboard.scheduledLoadError'),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, schema, roles, t])

  // "My drafts" (fiche 22 tâche 2's to-do widget): drafts this actor left
  // behind, across every collection they may read drafts of. Filtered
  // client-side by `createdBy` — the wire query has no author filter, only
  // equality on declared fields (`packages/schema/src/store/types.ts`), and
  // a collection's own drafts are already a small, bounded fetch.
  useEffect(() => {
    if (token === null || actorId === null || schema.status !== 'ready') return
    let cancelled = false
    const readable = schema.schema.collections.filter((collection) =>
      canPerform('update', collection, roles),
    )
    Promise.all(
      readable.map((collection) =>
        listEntries(token, collection.name, { status: 'draft', limit: 20 })
          .then((page) =>
            page.items
              .filter((entry) => entry.createdBy === actorId)
              .map((entry) => ({ collection: collection.name, entry })),
          )
          .catch(() => []),
      ),
    )
      .then((results) => {
        if (!cancelled) setMyDrafts(results.flat().slice(0, 8))
      })
      .catch((caught) => {
        if (!cancelled) {
          setMyDraftsError(
            caught instanceof ApiError ? caught.message : t('dashboard.myDraftsLoadError'),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, actorId, schema, roles, t])

  const readableCollections: readonly CollectionSummary[] =
    schema.status === 'ready'
      ? schema.schema.collections.filter((collection) => canPerform('read', collection, roles))
      : []
  const creatableCollections: readonly CollectionSummary[] = readableCollections.filter(
    (collection) => canPerform('create', collection, roles),
  )

  const imminentSchedules = useMemo(() => {
    const cutoff = Date.now() + IMMINENT_HOURS * 60 * 60 * 1000
    return scheduled.filter((item) => {
      const at = item.entry.publishedAt === null ? null : Date.parse(item.entry.publishedAt)
      return at !== null && Number.isFinite(at) && at <= cutoff
    })
  }, [scheduled])

  function labelFor(name: string): string {
    const found = readableCollections.find((collection) => collection.name === name)
    return found?.labels.plural ?? name
  }

  function toggleHidden(id: DashboardWidgetId): void {
    setPrefs((current) => {
      const hidden = new Set(current.hidden)
      if (hidden.has(id)) hidden.delete(id)
      else hidden.add(id)
      const next = { order: current.order, hidden }
      saveDashboardPrefs(next)
      return next
    })
  }

  /**
   * Moves `id` past its neighbour among *visible* widgets only (fiche 22
   * tâche 8, part 2's redesign no longer interleaves hidden widgets into
   * this list, so a raw `moveWidget` swap against `current.order` — which
   * would swap with whatever sits next in the full array, hidden or not —
   * could silently do nothing the reader can see). Reuses `reorderWidget`
   * unchanged: moving `id` to just before its upward neighbour, or moving
   * that neighbour to just before `id` for "down", both reduce to the same
   * "insert before" primitive `dropBefore` already relies on.
   */
  function move(id: DashboardWidgetId, direction: 'up' | 'down'): void {
    setPrefs((current) => {
      const visible = current.order.filter((candidate) => !current.hidden.has(candidate))
      const pos = visible.indexOf(id)
      const targetPos = direction === 'up' ? pos - 1 : pos + 1
      if (pos === -1 || targetPos < 0 || targetPos >= visible.length) return current
      const neighbour = visible[targetPos] as DashboardWidgetId
      const order =
        direction === 'up'
          ? reorderWidget(current.order, id, neighbour)
          : reorderWidget(current.order, neighbour, id)
      const next = { order, hidden: current.hidden }
      saveDashboardPrefs(next)
      return next
    })
  }

  function dropBefore(id: DashboardWidgetId, beforeId: DashboardWidgetId): void {
    setPrefs((current) => {
      const next = { order: reorderWidget(current.order, id, beforeId), hidden: current.hidden }
      saveDashboardPrefs(next)
      return next
    })
  }

  function resetPrefs(): void {
    setPrefs(resetDashboardPrefs())
  }

  async function submitQuickDraft(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (token === null || draftCollection === '' || draftTitle.trim() === '') return

    const collection = creatableCollections.find((candidate) => candidate.name === draftCollection)
    if (collection === undefined) return

    const titleField = firstFieldOf(collection, 'text')
    const bodyField = firstFieldOf(collection, 'richText')
    if (titleField === null) {
      setDraftError(t('dashboard.quickDraftNoTitleField'))
      return
    }

    const values: Record<string, unknown> = { [titleField]: draftTitle.trim() }
    if (bodyField !== null && draftBody.trim() !== '') {
      values[bodyField] = plainTextToRichText(draftBody)
    }

    setDraftBusy(true)
    setDraftError(null)
    try {
      const created = await createEntry(token, draftCollection, values)
      navigate(
        `/collections/${encodeURIComponent(draftCollection)}/${encodeURIComponent(created.id)}`,
      )
    } catch (caught) {
      setDraftError(caught instanceof ApiError ? caught.message : t('dashboard.quickDraftError'))
    } finally {
      setDraftBusy(false)
    }
  }

  // ---------------------------------------------------------------- widgets

  function renderSummary(): JSX.Element {
    return (
      <section
        aria-labelledby="dashboard-summary-heading"
        className="reveal reveal-1 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
      >
        <h2 id="dashboard-summary-heading" className="m-0 flex items-center gap-2 text-base">
          <PulseIcon className="size-4 text-primary" />
          {t('dashboard.summaryHeading')}
        </h2>
        {summaryError !== null && (
          <p role="alert" className="m-0 text-sm font-medium text-destructive">
            {summaryError}
          </p>
        )}
        {summaryError === null && summary === null && (
          <p className="m-0 text-sm text-muted-foreground">{t('common.loading')}</p>
        )}
        {summaryError === null && summary !== null && summary.length === 0 && (
          <p className="m-0 text-sm text-muted-foreground">{t('dashboard.summaryEmpty')}</p>
        )}
        {summary !== null && summary.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {summary.map((row) => (
              <li
                key={row.collection}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border pb-2.5 text-sm last:border-b-0 last:pb-0"
              >
                <Link
                  to={`/collections/${encodeURIComponent(row.collection)}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {labelFor(row.collection)}
                </Link>
                <span className="flex flex-wrap gap-3 font-mono text-xs">
                  <Link
                    to={`/collections/${encodeURIComponent(row.collection)}`}
                    className="text-muted-foreground hover:underline"
                  >
                    {t('dashboard.summaryTotal', { count: row.total })}
                  </Link>
                  {row.draft !== null && (
                    <Link
                      to={`/collections/${encodeURIComponent(row.collection)}?status=draft`}
                      className="text-primary underline underline-offset-2"
                    >
                      {t('dashboard.summaryDraft', { count: row.draft })}
                    </Link>
                  )}
                  {row.scheduled !== null && row.scheduled > 0 && (
                    <Link
                      to={`/collections/${encodeURIComponent(row.collection)}?status=scheduled`}
                      className="text-muted-foreground hover:underline"
                    >
                      {t('dashboard.summaryScheduled', { count: row.scheduled })}
                    </Link>
                  )}
                  {row.trashed !== null && row.trashed > 0 && (
                    // Not a link: no screen today opens the trash pre-filtered
                    // to one collection (`/trash` picks a collection itself),
                    // so this stays a plain figure rather than a dead link.
                    <span className="text-muted-foreground">
                      {t('dashboard.summaryTrashed', { count: row.trashed })}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  function renderHealth(): JSX.Element {
    return (
      <section
        aria-labelledby="dashboard-health-heading"
        className="reveal reveal-2 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
      >
        <h2 id="dashboard-health-heading" className="m-0 flex items-center gap-2 text-base">
          <PulseIcon className="size-4 text-primary" />
          {t('dashboard.healthHeading')}
        </h2>
        {!isAdmin && (
          <p className="m-0 text-sm text-muted-foreground">{t('dashboard.adminOnly')}</p>
        )}
        {isAdmin && healthError !== null && (
          <p role="alert" className="m-0 text-sm font-medium text-destructive">
            {healthError}
          </p>
        )}
        {isAdmin && healthError === null && health === null && (
          <p className="m-0 text-sm text-muted-foreground">{t('common.loading')}</p>
        )}
        {isAdmin && health !== null && (
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
            <li className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('dashboard.database')}
              </span>
              <HealthBadge report={health.database} />
            </li>
            <li className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('dashboard.storage')}
              </span>
              <HealthBadge report={health.storage} />
            </li>
          </ul>
        )}
      </section>
    )
  }

  function renderActivity(): JSX.Element {
    return (
      <section
        aria-labelledby="dashboard-activity-heading"
        className="reveal reveal-3 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
      >
        <h2 id="dashboard-activity-heading" className="m-0 flex items-center gap-2 text-base">
          <AuditIcon className="size-4 text-primary" />
          {t('dashboard.activityHeading')}
        </h2>
        {!isAdmin && (
          <p className="m-0 text-sm text-muted-foreground">{t('dashboard.adminOnly')}</p>
        )}
        {isAdmin && activityError !== null && (
          <p role="alert" className="m-0 text-sm font-medium text-destructive">
            {activityError}
          </p>
        )}
        {isAdmin && activityError === null && activity.length === 0 && (
          <p className="m-0 text-sm text-muted-foreground">{t('dashboard.noActivity')}</p>
        )}
        {isAdmin && activity.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="border-b border-border pb-2.5 text-sm leading-5 last:border-b-0 last:pb-0"
              >
                <span className="font-mono text-xs text-muted-foreground">{entry.at}</span>
                <br />
                <span className="font-medium">
                  {entry.actorId === null ? '—' : (actorNames.get(entry.actorId) ?? entry.actorId)}
                </span>{' '}
                — {entry.action}
                {entry.collection !== null && (
                  <span className="text-muted-foreground"> ({entry.collection})</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  function renderAnalytics(): JSX.Element {
    return (
      <section
        aria-labelledby="dashboard-analytics-heading"
        className="reveal reveal-4 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
      >
        <h2 id="dashboard-analytics-heading" className="m-0 flex items-center gap-2 text-base">
          <TrendIcon className="size-4 text-primary" />
          {t('analytics.widgetHeading')}
        </h2>
        {!isAdmin && (
          <p className="m-0 text-sm text-muted-foreground">{t('dashboard.adminOnly')}</p>
        )}
        {isAdmin && analyticsError !== null && (
          <p role="alert" className="m-0 text-sm font-medium text-destructive">
            {analyticsError}
          </p>
        )}
        {isAdmin && analyticsError === null && analytics === null && (
          <p className="m-0 text-sm text-muted-foreground">{t('common.loading')}</p>
        )}
        {isAdmin && analytics !== null && (
          <>
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 text-sm sm:grid-cols-2">
              <li>
                {t('analytics.widgetTotal')}: {analytics.totalViews}
              </li>
              <li>
                {t('analytics.widgetVisitors')}: {analytics.uniqueVisitors}
              </li>
            </ul>
            <p className="m-0 text-sm">
              <a href="/analytics" className="text-primary underline underline-offset-2">
                {t('analytics.widgetLink')}
              </a>
            </p>
          </>
        )}
      </section>
    )
  }

  function renderScheduled(): JSX.Element {
    return (
      <section
        aria-labelledby="dashboard-scheduled-heading"
        className="reveal reveal-5 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
      >
        <h2 id="dashboard-scheduled-heading" className="m-0 flex items-center gap-2 text-base">
          <ClockIcon className="size-4 text-primary" />
          {t('dashboard.scheduledHeading')}
        </h2>
        {scheduledError !== null && (
          <p role="alert" className="m-0 text-sm font-medium text-destructive">
            {scheduledError}
          </p>
        )}
        {scheduledError === null && scheduled.length === 0 && (
          <p className="m-0 text-sm text-muted-foreground">{t('dashboard.noScheduled')}</p>
        )}
        {scheduled.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {scheduled.map((item) => (
              <li
                key={`${item.collection}:${item.entry.id}`}
                className="flex items-center gap-2 text-sm"
              >
                <span className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {item.collection}
                </span>
                {titleOf(item.entry)}
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  function renderTodo(): JSX.Element {
    const hasAnything = myDrafts.length > 0 || imminentSchedules.length > 0
    return (
      <section
        aria-labelledby="dashboard-todo-heading"
        className="reveal reveal-6 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
      >
        <h2 id="dashboard-todo-heading" className="m-0 flex items-center gap-2 text-base">
          <ClockIcon className="size-4 text-primary" />
          {t('dashboard.todoHeading')}
        </h2>
        {myDraftsError !== null && (
          <p role="alert" className="m-0 text-sm font-medium text-destructive">
            {myDraftsError}
          </p>
        )}
        {!hasAnything && myDraftsError === null && (
          <p className="m-0 text-sm text-muted-foreground">{t('dashboard.todoEmpty')}</p>
        )}
        {myDrafts.length > 0 && (
          <div>
            <h3 className="m-0 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('dashboard.todoMyDrafts')}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {myDrafts.map((item) => (
                <li
                  key={`draft:${item.collection}:${item.entry.id}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {item.collection}
                  </span>
                  <Link
                    to={`/collections/${encodeURIComponent(item.collection)}/${encodeURIComponent(item.entry.id)}`}
                    className="hover:underline"
                  >
                    {titleOf(item.entry)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {imminentSchedules.length > 0 && (
          <div>
            <h3 className="m-0 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('dashboard.todoImminent')}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {imminentSchedules.map((item) => (
                <li
                  key={`imminent:${item.collection}:${item.entry.id}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {item.collection}
                  </span>
                  {titleOf(item.entry)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    )
  }

  function renderShortcuts(): JSX.Element {
    return (
      <section
        aria-labelledby="dashboard-shortcuts-heading"
        className="reveal flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
      >
        <h2 id="dashboard-shortcuts-heading" className="m-0 flex items-center gap-2 text-base">
          <PlusIcon className="size-4 text-primary" />
          {t('dashboard.shortcutsHeading')}
        </h2>
        {creatableCollections.length === 0 && (
          <p className="m-0 text-sm text-muted-foreground">{t('dashboard.shortcutsEmpty')}</p>
        )}
        <ul className="m-0 flex flex-wrap list-none gap-2 p-0">
          {creatableCollections.map((collection) => (
            <li key={collection.name}>
              <Link
                to={`/collections/${encodeURIComponent(collection.name)}/new`}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
              >
                <PlusIcon className="size-3.5" />
                {t('dashboard.shortcutNew', { label: collection.labels.singular })}
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/media"
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              <MediaIcon className="size-3.5" />
              {t('dashboard.shortcutUploadMedia')}
            </Link>
          </li>
        </ul>

        {creatableCollections.length > 0 && (
          <form
            onSubmit={(event) => void submitQuickDraft(event)}
            className="flex flex-col gap-2 border-t border-dashed border-border pt-4"
          >
            <h3 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('dashboard.quickDraftHeading')}
            </h3>
            {draftError !== null && (
              <p role="alert" className="m-0 text-sm font-medium text-destructive">
                {draftError}
              </p>
            )}
            <label className="flex flex-col gap-1 text-sm">
              {t('dashboard.quickDraftCollection')}
              <select
                value={draftCollection}
                onChange={(event) => setDraftCollection(event.target.value)}
                className="rounded-sm border border-border bg-background px-2 py-1.5"
              >
                <option value="">{t('dashboard.quickDraftChoose')}</option>
                {creatableCollections.map((collection) => (
                  <option key={collection.name} value={collection.name}>
                    {collection.labels.singular}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('dashboard.quickDraftTitle')}
              <input
                type="text"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                className="rounded-sm border border-border bg-background px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('dashboard.quickDraftBody')}
              <textarea
                value={draftBody}
                onChange={(event) => setDraftBody(event.target.value)}
                rows={3}
                className="rounded-sm border border-border bg-background px-2 py-1.5"
              />
            </label>
            <button
              type="submit"
              disabled={draftBusy || draftCollection === '' || draftTitle.trim() === ''}
              className="self-start rounded-sm border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
            >
              {draftBusy ? t('common.loading') : t('dashboard.quickDraftSubmit')}
            </button>
          </form>
        )}
      </section>
    )
  }

  function renderBackups(): JSX.Element {
    return (
      <section
        aria-labelledby="dashboard-backups-heading"
        className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-card p-5 text-sm text-muted-foreground"
      >
        <h2 id="dashboard-backups-heading" className="m-0 text-xs font-semibold uppercase">
          {t('dashboard.backupsHeading')}
        </h2>
        <p className="m-0">{t('dashboard.backupsBody')}</p>
      </section>
    )
  }

  const renderers: Record<DashboardWidgetId, () => JSX.Element> = {
    summary: renderSummary,
    health: renderHealth,
    activity: renderActivity,
    analytics: renderAnalytics,
    scheduled: renderScheduled,
    todo: renderTodo,
    shortcuts: renderShortcuts,
    backups: renderBackups,
  }

  const visibleWidgetIds = prefs.order.filter((id) => !prefs.hidden.has(id))
  const hiddenWidgetIds = prefs.order.filter((id) => prefs.hidden.has(id))

  return (
    <section aria-labelledby="dashboard-heading" className="flex flex-col gap-8">
      <div className="reveal border-b-2 border-foreground pb-4">
        <p className="m-0 font-mono text-xs font-medium tracking-[0.2em] text-primary uppercase">
          {t('shell.brand')}
        </p>
        <h1 id="dashboard-heading" className="m-0 text-3xl leading-tight font-bold">
          {t('dashboard.heading')}
        </h1>
      </div>

      {/* Fiche 22 tâche 3, redesigned by tâche 8 part 2: order and visibility,
          per person, per browser (`localStorage`, never a site setting).
          A widget is either genuinely on the dashboard (reorderable, and
          removable) or genuinely off it (picked back from a list, never a
          checkbox pretending a hidden widget is still "there"). Every move
          here is also a named button — dragging is a shortcut for what the
          buttons already do, the same rule L16 applies to the block
          builder's sidebar. */}
      <details className="reveal rounded-lg border border-border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">{t('dashboard.customize')}</summary>

        <h3 className="m-0 mt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t('dashboard.widgetsOnDashboard')}
        </h3>
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {visibleWidgetIds.map((id, index) => (
            <li
              key={id}
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/dashboard-widget', id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const raw = event.dataTransfer.getData('text/dashboard-widget')
                if (raw.length > 0) dropBefore(raw as DashboardWidgetId, id)
              }}
              className="flex items-center gap-2 rounded-sm border border-border bg-background px-2.5 py-1.5"
            >
              <span className="flex-1">{t(`dashboard.widgetName.${id}`)}</span>
              <button
                type="button"
                onClick={() => move(id, 'up')}
                disabled={index === 0}
                className="rounded-sm border border-border px-2 py-0.5 disabled:opacity-40"
              >
                {t('dashboard.moveUp')}
              </button>
              <button
                type="button"
                onClick={() => move(id, 'down')}
                disabled={index === visibleWidgetIds.length - 1}
                className="rounded-sm border border-border px-2 py-0.5 disabled:opacity-40"
              >
                {t('dashboard.moveDown')}
              </button>
              <button
                type="button"
                onClick={() => toggleHidden(id)}
                aria-label={t('dashboard.removeWidget', { name: t(`dashboard.widgetName.${id}`) })}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-destructive hover:bg-destructive/10"
              >
                <CloseIcon className="size-3.5" />
                {t('dashboard.remove')}
              </button>
            </li>
          ))}
          {visibleWidgetIds.length === 0 && (
            <li className="text-muted-foreground">{t('dashboard.noWidgetsShown')}</li>
          )}
        </ul>

        <h3 className="m-0 mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t('dashboard.availableWidgets')}
        </h3>
        {hiddenWidgetIds.length === 0 ? (
          <p className="m-0 mt-2 text-muted-foreground">{t('dashboard.allWidgetsShown')}</p>
        ) : (
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {hiddenWidgetIds.map((id) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-sm border border-dashed border-border bg-background px-2.5 py-1.5"
              >
                <span className="flex-1 text-muted-foreground">
                  {t(`dashboard.widgetName.${id}`)}
                </span>
                <button
                  type="button"
                  onClick={() => toggleHidden(id)}
                  aria-label={t('dashboard.addWidget', { name: t(`dashboard.widgetName.${id}`) })}
                  className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-primary hover:bg-primary/10"
                >
                  <PlusIcon className="size-3.5" />
                  {t('dashboard.add')}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={resetPrefs}
          className="mt-4 rounded-sm border border-border px-3 py-1.5"
        >
          {t('dashboard.resetLayout')}
        </button>
      </details>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {visibleWidgetIds.map((id) => (
          <div key={id} className={id === 'health' ? 'lg:col-span-2' : undefined}>
            {renderers[id]()}
          </div>
        ))}
      </div>
    </section>
  )
}
