import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type AnalyticsSummary, getAnalyticsSummary } from '../api/analytics-client.js'
import { type AuditEntry, listAuditEntries } from '../api/audit-client.js'
import { ApiError } from '../api/client.js'
import { type Entry, listEntries } from '../api/content-client.js'
import { getSiteHealth, type SiteHealth } from '../api/health-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { AuditIcon, ClockIcon, PulseIcon, TrendIcon } from '../ui/icons.js'

const DASHBOARD_WINDOW_DAYS = 7

interface ScheduledItem {
  readonly collection: string
  readonly entry: Entry
}

function titleOf(entry: Entry): string {
  const candidate = Object.values(entry.values).find((value) => typeof value === 'string')
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : entry.id
}

const STATUS_DOT: Record<SiteHealth[keyof SiteHealth]['status'], string> = {
  ok: 'bg-success',
  degraded: 'bg-warning',
  down: 'bg-destructive',
}

function HealthBadge({ report }: { readonly report: SiteHealth[keyof SiteHealth] }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-1 font-mono text-xs">
      <span
        className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[report.status]}`}
        aria-hidden="true"
      />
      {report.driver} <span className="text-muted-foreground">({report.tier})</span> —{' '}
      {report.status}
    </span>
  )
}

/**
 * L2 task 15. Three widgets read real state (`/api/health`, `/api/audit`,
 * scheduled content) — the other three (CVE, Core Web Vitals, sauvegardes)
 * have no data source anywhere in this codebase yet, so they stay empty and
 * explicit rather than showing a fabricated number, the same rule the
 * placeholder this replaces already applied to agent-related widgets.
 *
 * The markup below keeps the same plain `<section>`/`<h2>`/`<ul>` shape the
 * unstyled version used (each widget its own labelled landmark section) —
 * only classNames and icons were added on top. A `Card`-component rewrite
 * was tried and reverted: it visually read the same but reproducibly made
 * `test/notices/notice-board.test.tsx` flaky when run in the same file
 * batch as this route's own test, and the plain structure below does not.
 */
export function DashboardRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const schema = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [health, setHealth] = useState<SiteHealth | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  const [activity, setActivity] = useState<readonly AuditEntry[]>([])
  const [activityError, setActivityError] = useState<string | null>(null)

  const [scheduled, setScheduled] = useState<readonly ScheduledItem[]>([])
  const [scheduledError, setScheduledError] = useState<string | null>(null)

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

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
    getAnalyticsSummary(token, DASHBOARD_WINDOW_DAYS)
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

      {/* An asymmetric composition, not six equal cards: system health is the
          dominant left column (it is the one widget with a real, currently
          actionable data source), activity is a narrower companion, and
          scheduled content runs full-width beneath both. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section
          aria-labelledby="dashboard-health-heading"
          className="reveal reveal-1 flex flex-col gap-4 rounded-lg border-2 border-foreground bg-card p-5 text-card-foreground shadow-card"
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

        <section
          aria-labelledby="dashboard-activity-heading"
          className="reveal reveal-2 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
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
                  <span className="font-medium">{entry.actorId ?? '—'}</span> — {entry.action}
                  {entry.collection !== null && (
                    <span className="text-muted-foreground"> ({entry.collection})</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section
        aria-labelledby="dashboard-analytics-heading"
        className="reveal reveal-3 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
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

      <section
        aria-labelledby="dashboard-scheduled-heading"
        className="reveal reveal-4 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
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

      {/* Deliberately quiet: none of these three has a real data source yet
          (see the module comment above), so they are a muted footnote strip
          rather than cards claiming equal weight with the widgets above. */}
      <div className="reveal reveal-5 grid grid-cols-1 gap-4 border-t border-dashed border-border pt-5 text-sm text-muted-foreground sm:grid-cols-3">
        <section aria-labelledby="dashboard-cve-heading">
          <h2 id="dashboard-cve-heading" className="m-0 text-xs font-semibold uppercase">
            {t('dashboard.cveHeading')}
          </h2>
          <p className="m-0 mt-1">{t('dashboard.cveBody')}</p>
        </section>
        <section aria-labelledby="dashboard-vitals-heading">
          <h2 id="dashboard-vitals-heading" className="m-0 text-xs font-semibold uppercase">
            {t('dashboard.vitalsHeading')}
          </h2>
          <p className="m-0 mt-1">{t('dashboard.vitalsBody')}</p>
        </section>
        <section aria-labelledby="dashboard-backups-heading">
          <h2 id="dashboard-backups-heading" className="m-0 text-xs font-semibold uppercase">
            {t('dashboard.backupsHeading')}
          </h2>
          <p className="m-0 mt-1">{t('dashboard.backupsBody')}</p>
        </section>
      </div>
    </section>
  )
}
