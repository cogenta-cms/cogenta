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

const DASHBOARD_WINDOW_DAYS = 7

interface ScheduledItem {
  readonly collection: string
  readonly entry: Entry
}

function titleOf(entry: Entry): string {
  const candidate = Object.values(entry.values).find((value) => typeof value === 'string')
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : entry.id
}

function HealthBadge({ report }: { readonly report: SiteHealth[keyof SiteHealth] }): JSX.Element {
  return (
    <span className={`dashboard__badge dashboard__badge--${report.status}`}>
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
    <section aria-labelledby="dashboard-heading">
      <h1 id="dashboard-heading">{t('dashboard.heading')}</h1>

      <section aria-labelledby="dashboard-health-heading">
        <h2 id="dashboard-health-heading">{t('dashboard.healthHeading')}</h2>
        {!isAdmin && <p>{t('dashboard.adminOnly')}</p>}
        {isAdmin && healthError !== null && <p role="alert">{healthError}</p>}
        {isAdmin && healthError === null && health === null && <p>{t('common.loading')}</p>}
        {isAdmin && health !== null && (
          <ul>
            <li>
              {t('dashboard.database')} <HealthBadge report={health.database} />
            </li>
            <li>
              {t('dashboard.storage')} <HealthBadge report={health.storage} />
            </li>
          </ul>
        )}
      </section>

      <section aria-labelledby="dashboard-analytics-heading">
        <h2 id="dashboard-analytics-heading">{t('analytics.widgetHeading')}</h2>
        {!isAdmin && <p>{t('dashboard.adminOnly')}</p>}
        {isAdmin && analyticsError !== null && <p role="alert">{analyticsError}</p>}
        {isAdmin && analyticsError === null && analytics === null && <p>{t('common.loading')}</p>}
        {isAdmin && analytics !== null && (
          <>
            <ul>
              <li>
                {t('analytics.widgetTotal')}: {analytics.totalViews}
              </li>
              <li>
                {t('analytics.widgetVisitors')}: {analytics.uniqueVisitors}
              </li>
            </ul>
            <p>
              <a href="/analytics">{t('analytics.widgetLink')}</a>
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="dashboard-activity-heading">
        <h2 id="dashboard-activity-heading">{t('dashboard.activityHeading')}</h2>
        {!isAdmin && <p>{t('dashboard.adminOnly')}</p>}
        {isAdmin && activityError !== null && <p role="alert">{activityError}</p>}
        {isAdmin && activityError === null && activity.length === 0 && (
          <p>{t('dashboard.noActivity')}</p>
        )}
        {isAdmin && activity.length > 0 && (
          <ul>
            {activity.map((entry) => (
              <li key={entry.id}>
                {entry.at} — {entry.actorId ?? '—'} — {entry.action}
                {entry.collection !== null && ` (${entry.collection})`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dashboard-scheduled-heading">
        <h2 id="dashboard-scheduled-heading">{t('dashboard.scheduledHeading')}</h2>
        {scheduledError !== null && <p role="alert">{scheduledError}</p>}
        {scheduledError === null && scheduled.length === 0 && <p>{t('dashboard.noScheduled')}</p>}
        {scheduled.length > 0 && (
          <ul>
            {scheduled.map((item) => (
              <li key={`${item.collection}:${item.entry.id}`}>
                {item.collection} — {titleOf(item.entry)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dashboard-cve-heading">
        <h2 id="dashboard-cve-heading">{t('dashboard.cveHeading')}</h2>
        <p>{t('dashboard.cveBody')}</p>
      </section>

      <section aria-labelledby="dashboard-vitals-heading">
        <h2 id="dashboard-vitals-heading">{t('dashboard.vitalsHeading')}</h2>
        <p>{t('dashboard.vitalsBody')}</p>
      </section>

      <section aria-labelledby="dashboard-backups-heading">
        <h2 id="dashboard-backups-heading">{t('dashboard.backupsHeading')}</h2>
        <p>{t('dashboard.backupsBody')}</p>
      </section>
    </section>
  )
}
