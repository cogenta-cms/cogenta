import { type JSX, useEffect, useState } from 'react'
import { type AuditEntry, listAuditEntries } from '../api/audit-client.js'
import { ApiError } from '../api/client.js'
import { type Entry, listEntries } from '../api/content-client.js'
import { getSiteHealth, type SiteHealth } from '../api/health-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'

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
            caught instanceof ApiError ? caught.message : "Impossible de lire l'état du site.",
          )
        }
      })
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
            caught instanceof ApiError ? caught.message : "Impossible de charger l'activité.",
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, isAdmin])

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
            caught instanceof ApiError
              ? caught.message
              : 'Impossible de charger les contenus programmés.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, schema, roles])

  return (
    <section aria-labelledby="dashboard-heading">
      <h1 id="dashboard-heading">Tableau de bord</h1>

      <section aria-labelledby="dashboard-health-heading">
        <h2 id="dashboard-health-heading">Santé du site</h2>
        {!isAdmin && <p>Réservé au rôle « admin ».</p>}
        {isAdmin && healthError !== null && <p role="alert">{healthError}</p>}
        {isAdmin && healthError === null && health === null && <p>Chargement…</p>}
        {isAdmin && health !== null && (
          <ul>
            <li>
              Base de données : <HealthBadge report={health.database} />
            </li>
            <li>
              Stockage : <HealthBadge report={health.storage} />
            </li>
          </ul>
        )}
      </section>

      <section aria-labelledby="dashboard-activity-heading">
        <h2 id="dashboard-activity-heading">Activité récente</h2>
        {!isAdmin && <p>Réservé au rôle « admin ».</p>}
        {isAdmin && activityError !== null && <p role="alert">{activityError}</p>}
        {isAdmin && activityError === null && activity.length === 0 && <p>Aucune activité.</p>}
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
        <h2 id="dashboard-scheduled-heading">Contenus programmés</h2>
        {scheduledError !== null && <p role="alert">{scheduledError}</p>}
        {scheduledError === null && scheduled.length === 0 && <p>Aucun contenu programmé.</p>}
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
        <h2 id="dashboard-cve-heading">CVE ouvertes</h2>
        <p>
          Aucune source de données pour l'instant : ce widget arrive avec l'agent de veille de
          sécurité (L5).
        </p>
      </section>

      <section aria-labelledby="dashboard-vitals-heading">
        <h2 id="dashboard-vitals-heading">Core Web Vitals</h2>
        <p>Aucune source de données pour l'instant : ce widget arrive avec le rendu mesuré (L5).</p>
      </section>

      <section aria-labelledby="dashboard-backups-heading">
        <h2 id="dashboard-backups-heading">État des sauvegardes</h2>
        <p>
          Aucune source de données pour l'instant : ce widget arrive avec l'agent de sauvegarde
          (L5).
        </p>
      </section>
    </section>
  )
}
