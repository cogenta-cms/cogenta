import type { CruxMetrics, Urgency } from '@cogenta/agents-builtin'
import type { ReportChannelMessage } from '@cogenta/channels'
import { buildReport, type ChannelKeyFigure, type ChannelMessageSection } from '@cogenta/channels'
import type { TelemetrySnapshot } from '../control/state.js'
import type { SiteRegistration } from '../enrollment/store.js'
import type { DriftEntry } from '../inventory/drift.js'

/**
 * "## Rapports client" (`docs/lots/L8-flotte.md`): "Un rapport mensuel par
 * site... C'est un livrable commercial pour l'agence, pas un tableau
 * technique. Le format doit pouvoir être lu par le client final."
 *
 * A field the lot names but for which no real data source exists anywhere
 * in this codebase yet (`available: false`) is never fabricated — the whole
 * point of this shape is that a caller CANNOT accidentally read a plausible
 * number out of an unavailable field, the same "structural honesty" `../agent/types.js`'s
 * `TelemetryPayload` already applies to what a site reports upstream.
 */
export type ReportField<T> =
  | { readonly available: true; readonly value: T }
  | { readonly available: false }

function available<T>(value: T): ReportField<T> {
  return { available: true, value }
}

const unavailable: ReportField<never> = { available: false }

export interface ClientReport {
  readonly siteId: string
  readonly siteName: string
  readonly client: string | null
  readonly generatedAt: string
  /** Real when `../agent/types.js`'s `AvailabilitySummary.uptimeRatio` is non-null; `../agent/types.js` itself documents no real uptime monitor exists yet, so this is honestly `available: false` for every site today. */
  readonly availability: ReportField<number>
  /** Real, always — `TelemetryPayload.openCves`, the security agent's real OSV/EPSS pipeline (tasks 2/5). Never `available: false`: an empty list is itself the real, reportable "no known incidents" answer, not an unavailable field. */
  readonly securityIncidents: readonly {
    readonly urgency: Urgency
    readonly status: 'open' | 'patched' | 'ignored'
  }[]
  /** Real when the performance agent's CrUX pipeline has field data for this site (`../agent/types.js`'s own `null` case: not enough real-user traffic, not an error); `available: false` only when no telemetry has ever been received at all. */
  readonly performance: ReportField<CruxMetrics>
  /** No real "content published" count exists anywhere in `TelemetryPayload` or any other fleet-visible signal — the lot's own absolute "aucune donnée de contenu ne remonte" rule means this could only ever be a real operational COUNT, and no such count is collected today. Always `available: false`, honestly, never estimated. */
  readonly publishedContent: ReportField<number>
  /** No live `AgentRegistry` exists anywhere in this codebase (R2-honest finding, repeated across L5/L7/L9/L8) — a site's own AI agents' actions have no real fleet-visible signal to report. Always `available: false`. */
  readonly agentActions: ReportField<number>
  /** Real when `AvailabilitySummary`'s sibling `BackupSummary.lastResult` is not `'unknown'` — `../agent/types.js` documents no real backup mechanism exists yet, so this is honestly `available: false` for every site today. */
  readonly backups: ReportField<{ readonly at: string; readonly result: 'success' | 'failure' }>
  /** Real — every component (`../inventory/drift.js`'s `DriftEntry`) this specific site is drifted on, already filtered to `siteId`. Empty is itself the real "up to date with the fleet" answer. */
  readonly versionDrift: readonly DriftEntry[]
}

/**
 * Real assembly from real, already-verified fleet data (tasks 3/4/5's real
 * stores) — no new data source, a commercial-report-shaped view over what
 * already exists. `driftEntries` is the FULL fleet's drift list (as
 * `../inventory/drift.js`'s `detectDrift` returns it) — filtered here to
 * this one site, never a caller's job to pre-filter.
 */
export function assembleClientReport(
  site: SiteRegistration,
  snapshot: TelemetrySnapshot | null,
  driftEntries: readonly DriftEntry[],
  now: () => number = Date.now,
): ClientReport {
  const siteDrift = driftEntries.filter((entry) => entry.siteId === site.id)

  if (snapshot === null) {
    return {
      siteId: site.id,
      siteName: site.name,
      client: site.client,
      generatedAt: new Date(now()).toISOString(),
      availability: unavailable,
      securityIncidents: [],
      performance: unavailable,
      publishedContent: unavailable,
      agentActions: unavailable,
      backups: unavailable,
      versionDrift: siteDrift,
    }
  }

  const { payload } = snapshot
  const availability: ReportField<number> =
    payload.availability.uptimeRatio === null
      ? unavailable
      : available(payload.availability.uptimeRatio)
  const performance: ReportField<CruxMetrics> =
    payload.coreWebVitalsAggregate === null
      ? unavailable
      : available(payload.coreWebVitalsAggregate)
  const backups: ReportField<{ at: string; result: 'success' | 'failure' }> =
    payload.backups.lastResult === 'unknown' || payload.backups.lastBackupAt === null
      ? unavailable
      : available({ at: payload.backups.lastBackupAt, result: payload.backups.lastResult })

  return {
    siteId: site.id,
    siteName: site.name,
    client: site.client,
    generatedAt: new Date(now()).toISOString(),
    availability,
    securityIncidents: payload.openCves.map((cve) => ({
      urgency: cve.urgency,
      status: cve.status,
    })),
    performance,
    publishedContent: unavailable,
    agentActions: unavailable,
    backups,
    versionDrift: siteDrift,
  }
}

const URGENCY_FR: Record<Urgency, string> = {
  critical: 'critique',
  high: 'élevée',
  medium: 'moyenne',
  low: 'faible',
}

const STATUS_FR: Record<'open' | 'patched' | 'ignored', string> = {
  open: 'toujours ouverte',
  patched: 'corrigée',
  ignored: 'écartée après analyse',
}

/**
 * Plain-language French, never a raw technical identifier or a metric
 * without a sentence around it — the literal acceptance criterion ("un
 * rapport client est compréhensible par un non-technicien"), tested the
 * same way L7's `describeCapability` proved it: no bare CVE id, no raw
 * percentile number with nothing to say what it means.
 */
export function renderClientReport(report: ClientReport): ReportChannelMessage {
  const openCount = report.securityIncidents.filter((cve) => cve.status === 'open').length
  const criticalOpen = report.securityIncidents.some(
    (cve) => cve.status === 'open' && cve.urgency === 'critical',
  )

  const keyFigures: ChannelKeyFigure[] = [
    {
      label: 'Sécurité',
      value:
        openCount === 0
          ? 'Aucune faille connue en attente'
          : `${openCount} faille${openCount > 1 ? 's' : ''} de sécurité en attente de correction${criticalOpen ? ' (dont au moins une critique)' : ''}`,
    },
    {
      label: 'Mise à jour',
      value:
        report.versionDrift.length === 0
          ? 'Le site est à jour avec le reste de la flotte'
          : `${report.versionDrift.length} composant${report.versionDrift.length > 1 ? 's' : ''} à mettre à jour`,
    },
  ]

  const sections: ChannelMessageSection[] = []

  sections.push({
    heading: 'Sécurité',
    body:
      report.securityIncidents.length === 0
        ? 'Aucun incident connu.'
        : report.securityIncidents
            .map((cve) => `Faille ${URGENCY_FR[cve.urgency]}, ${STATUS_FR[cve.status]}.`)
            .join(' '),
  })

  sections.push({
    heading: 'Performances',
    body: report.performance.available
      ? describePerformance(report.performance.value)
      : 'Pas encore assez de visites pour mesurer la rapidité.',
  })

  sections.push({
    heading: 'Disponibilité',
    body: report.availability.available
      ? `Répond ${Math.round(report.availability.value * 100)}% du temps.`
      : 'Suivi pas encore activé.',
  })

  sections.push({
    heading: 'Sauvegardes',
    body: report.backups.available
      ? `Dernière sauvegarde le ${new Date(report.backups.value.at).toLocaleDateString('fr-FR')} — ${report.backups.value.result === 'success' ? 'réussie' : 'échouée'}.`
      : 'Pas encore de suivi automatique.',
  })

  sections.push({
    heading: 'Contenu et agents',
    body: 'Pas encore disponible dans ce rapport.',
  })

  return buildReport({
    title: `Rapport mensuel — ${report.siteName}`,
    keyFigures,
    sections,
  })
}

function describePerformance(metrics: CruxMetrics): string {
  if (metrics.lcpP75Ms === undefined) {
    return 'Des données de performance existent mais restent incomplètes pour ce site sur la période.'
  }
  const seconds = (metrics.lcpP75Ms / 1000).toFixed(1)
  const feel = metrics.lcpP75Ms <= 2500 ? 'rapide' : metrics.lcpP75Ms <= 4000 ? 'correcte' : 'lente'
  return `Le site met en moyenne ${seconds} seconde${Number(seconds) > 1 ? 's' : ''} à afficher son contenu principal pour un visiteur — une vitesse jugée ${feel}.`
}
