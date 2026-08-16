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
import { Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

const DASHBOARD_WINDOW_DAYS = 7

interface ScheduledItem {
  readonly collection: string
  readonly entry: Entry
}

function titleOf(entry: Entry): string {
  const candidate = Object.values(entry.values).find((value) => typeof value === 'string')
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : entry.id
}

/** Same three tones the rest of the design system uses — colour and text both carry the status. */
const HEALTH_BADGE_CLASS: Record<SiteHealth['database']['status'], string> = {
  ok: 'border-success/30 bg-success-surface text-success',
  degraded: 'border-warning/40 bg-warning-surface text-warning',
  down: 'border-destructive/30 bg-destructive-surface text-destructive',
}

function HealthBadge({ report }: { readonly report: SiteHealth[keyof SiteHealth] }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-sans text-xs leading-5 font-medium ${HEALTH_BADGE_CLASS[report.status]}`}
    >
      {report.driver} ({report.tier}) — {report.status}
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
 * Laid out as a grid of `Card` widgets, using the design system in `../ui/` —
 * a purely visual change from the previous hand-styled sections; every fetch,
 * every condition and every piece of state below is untouched.
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
    <section aria-labelledby="dashboard-heading" className="flex flex-col gap-6">
      <h1 id="dashboard-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('dashboard.heading')}
      </h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card aria-labelledby="dashboard-health-heading" className="hover:shadow-raised">
          <CardHeader>
            <CardTitle>
              <h2 id="dashboard-health-heading">{t('dashboard.healthHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {!isAdmin && (
              <p className="m-0 text-sm text-muted-foreground">{t('dashboard.adminOnly')}</p>
            )}
            {isAdmin && healthError !== null && (
              <Notice tone="danger" live="assertive">
                <p>{healthError}</p>
              </Notice>
            )}
            {isAdmin && healthError === null && health === null && (
              <p className="m-0 text-sm text-muted-foreground">{t('common.loading')}</p>
            )}
            {isAdmin && health !== null && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                <li className="flex flex-wrap items-center gap-2">
                  {t('dashboard.database')} <HealthBadge report={health.database} />
                </li>
                <li className="flex flex-wrap items-center gap-2">
                  {t('dashboard.storage')} <HealthBadge report={health.storage} />
                </li>
              </ul>
            )}
          </CardBody>
        </Card>

        <Card aria-labelledby="dashboard-analytics-heading" className="hover:shadow-raised">
          <CardHeader>
            <CardTitle>
              <h2 id="dashboard-analytics-heading">{t('analytics.widgetHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {!isAdmin && (
              <p className="m-0 text-sm text-muted-foreground">{t('dashboard.adminOnly')}</p>
            )}
            {isAdmin && analyticsError !== null && (
              <Notice tone="danger" live="assertive">
                <p>{analyticsError}</p>
              </Notice>
            )}
            {isAdmin && analyticsError === null && analytics === null && (
              <p className="m-0 text-sm text-muted-foreground">{t('common.loading')}</p>
            )}
            {isAdmin && analytics !== null && (
              <>
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                  <li>
                    {t('analytics.widgetTotal')}: {analytics.totalViews}
                  </li>
                  <li>
                    {t('analytics.widgetVisitors')}: {analytics.uniqueVisitors}
                  </li>
                </ul>
                <p className="m-0 mt-2 text-sm">
                  <a href="/analytics">{t('analytics.widgetLink')}</a>
                </p>
              </>
            )}
          </CardBody>
        </Card>

        <Card aria-labelledby="dashboard-activity-heading" className="hover:shadow-raised">
          <CardHeader>
            <CardTitle>
              <h2 id="dashboard-activity-heading">{t('dashboard.activityHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {!isAdmin && (
              <p className="m-0 text-sm text-muted-foreground">{t('dashboard.adminOnly')}</p>
            )}
            {isAdmin && activityError !== null && (
              <Notice tone="danger" live="assertive">
                <p>{activityError}</p>
              </Notice>
            )}
            {isAdmin && activityError === null && activity.length === 0 && (
              <p className="m-0 text-sm text-muted-foreground">{t('dashboard.noActivity')}</p>
            )}
            {isAdmin && activity.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {activity.map((entry) => (
                  <li key={entry.id}>
                    {entry.at} — {entry.actorId ?? '—'} — {entry.action}
                    {entry.collection !== null && ` (${entry.collection})`}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card aria-labelledby="dashboard-scheduled-heading" className="hover:shadow-raised">
          <CardHeader>
            <CardTitle>
              <h2 id="dashboard-scheduled-heading">{t('dashboard.scheduledHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {scheduledError !== null && (
              <Notice tone="danger" live="assertive">
                <p>{scheduledError}</p>
              </Notice>
            )}
            {scheduledError === null && scheduled.length === 0 && (
              <p className="m-0 text-sm text-muted-foreground">{t('dashboard.noScheduled')}</p>
            )}
            {scheduled.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {scheduled.map((item) => (
                  <li key={`${item.collection}:${item.entry.id}`}>
                    {item.collection} — {titleOf(item.entry)}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card aria-labelledby="dashboard-cve-heading" className="hover:shadow-raised">
          <CardHeader>
            <CardTitle>
              <h2 id="dashboard-cve-heading">{t('dashboard.cveHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="m-0 text-sm text-muted-foreground">{t('dashboard.cveBody')}</p>
          </CardBody>
        </Card>

        <Card aria-labelledby="dashboard-vitals-heading" className="hover:shadow-raised">
          <CardHeader>
            <CardTitle>
              <h2 id="dashboard-vitals-heading">{t('dashboard.vitalsHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="m-0 text-sm text-muted-foreground">{t('dashboard.vitalsBody')}</p>
          </CardBody>
        </Card>

        <Card aria-labelledby="dashboard-backups-heading" className="hover:shadow-raised">
          <CardHeader>
            <CardTitle>
              <h2 id="dashboard-backups-heading">{t('dashboard.backupsHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="m-0 text-sm text-muted-foreground">{t('dashboard.backupsBody')}</p>
          </CardBody>
        </Card>
      </div>
    </section>
  )
}
