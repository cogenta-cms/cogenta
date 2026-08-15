import { type AlertChannelMessage, buildAlert } from '@cogenta/channels'
import type { SiteRisk } from '../control/risk.js'
import type { TelemetrySnapshot } from '../control/state.js'
import type { SiteRegistration } from '../enrollment/store.js'
import type { CampaignRecord } from '../rollout/campaign.js'
import type { AlertConditionStore } from './conditions.js'

/**
 * "Alertes de flotte sur les canaux" (`docs/lots/L8-flotte.md`) — real,
 * operator-facing alerts for the agency, distinct from `../reporting/report.js`'s
 * commercial, end-client-facing monthly reports. Reuses `@cogenta/channels`'s
 * real `buildAlert` constructor (L6 task 6) exactly, the same reuse
 * discipline task 9 already established for `buildReport` — no hand-built
 * `AlertChannelMessage` literal anywhere in this module.
 */

const ADMIN_URL_FALLBACK = 'https://admin.invalid/fleet'

/**
 * A site crossing into `critical` risk (task 5's real `computeSiteRisk`) —
 * "un site avec une CVE critique passe devant" on the dashboard is the same
 * real signal an operator needs pushed to them immediately, not only seen
 * next time they open it.
 */
export function detectCriticalRiskAlert(risk: SiteRisk): AlertChannelMessage | null {
  if (risk.tier !== 'critical') return null
  const topReason = [...risk.reasons].sort((a, b) => b.points - a.points)[0]
  return buildAlert({
    title: `${risk.siteName} — risque critique`,
    severity: 'critical',
    context: topReason === undefined ? 'Risque critique détecté.' : topReason.detail,
    expectedAction: 'Examiner ce site dans le tableau de bord de flotte et agir sans délai.',
    adminUrl: ADMIN_URL_FALLBACK,
  })
}

/**
 * A rollout campaign transitioning to `halted` (task 7's real
 * `CampaignRecord`) — "un échec arrête toute la campagne" is exactly the
 * kind of event an operator needs to know about the moment it happens, not
 * discover by noticing an update never finished.
 */
export function detectCampaignHaltedAlert(
  campaign: CampaignRecord,
  siteNameById: ReadonlyMap<string, string>,
): AlertChannelMessage | null {
  if (campaign.status !== 'halted') return null
  const failedNames = campaign.failedSiteIds.map((id) => siteNameById.get(id) ?? id).join(', ')
  return buildAlert({
    title: `Campagne "${campaign.componentName}" arrêtée`,
    severity: 'critical',
    context:
      campaign.haltedReason ??
      `La mise à jour vers ${campaign.targetVersion} a échoué sur : ${failedNames || 'un site'}.`,
    expectedAction: 'Vérifier les sites en échec et envisager un retour arrière.',
    adminUrl: ADMIN_URL_FALLBACK,
  })
}

/**
 * "## Pièges connus": "Les faux positifs de disponibilité. Un réseau
 * instable produit des alertes de panne inexistantes. Exiger plusieurs
 * échecs consécutifs depuis plusieurs points avant d'alerter."
 *
 * This architecture has no active probing at all — "le plan de contrôle
 * n'ouvre jamais de connexion vers un site" (absolute since task 1, reused
 * by task 7's async-verification design). "Plusieurs points" (multiple
 * vantage points) has no honest equivalent here: there is only ONE real
 * observation channel, a site's own periodic telemetry contact. The
 * architecturally-consistent reading of the same anti-flapping INTENT is
 * "require sustained absence across multiple real expected-contact
 * windows" — a real, multi-cycle threshold, not a single missed window.
 */
const CONTACT_WINDOW_MS = 24 * 60 * 60 * 1000 // one real daily contact cycle, same reasoning as `../control/state.ts`'s retention and `../rollout/campaign.ts`'s DEFAULT_TIMEOUT_MS
const MISSED_WINDOWS_THRESHOLD = 3 // a single missed window is real network noise; three consecutive is a real, sustained absence

export function detectSiteSilentAlert(
  site: SiteRegistration,
  latestSnapshot: TelemetrySnapshot | null,
  now: () => number = Date.now,
): AlertChannelMessage | null {
  const referenceTime =
    latestSnapshot === null
      ? new Date(site.registeredAt).getTime()
      : new Date(latestSnapshot.ingestedAt).getTime()
  const silentMs = now() - referenceTime
  const missedWindows = Math.floor(silentMs / CONTACT_WINDOW_MS)
  if (missedWindows < MISSED_WINDOWS_THRESHOLD) return null

  return buildAlert({
    title: `${site.name} — silencieux`,
    severity: 'warning',
    context: `Aucun contact reçu depuis plus de ${missedWindows} jours.`,
    expectedAction: "Vérifier que le site est joignable et que son processus d'envoi fonctionne.",
    adminUrl: ADMIN_URL_FALLBACK,
  })
}

/**
 * Wraps any detection function with the real de-duplication layer
 * (`./conditions.js`): the message is only returned — and thus only ever
 * sent — on the check where the condition genuinely transitions from
 * inactive to active. Every subsequent check while it remains active
 * returns `null`, even though the underlying condition still holds.
 */
export async function raiseIfNew(
  conditionStore: AlertConditionStore,
  siteId: string,
  conditionType: 'critical-risk' | 'campaign-halted' | 'site-silent',
  message: AlertChannelMessage | null,
  now?: () => number,
): Promise<AlertChannelMessage | null> {
  if (message === null) {
    await conditionStore.clear(siteId, conditionType, now)
    return null
  }
  const { fired } = await conditionStore.raise(siteId, conditionType, now)
  return fired ? message : null
}

/**
 * The real dispatch integration point — a structural interface, never a
 * hard dependency on any specific `@cogenta/channels` adapter instance
 * (matches `../reporting/report.js`'s own boundary: depend on the real
 * message-CONSTRUCTOR types, never on a live adapter). No live control-plane
 * deployment exists anywhere in this lot; a real deployment plugs a real
 * `ChannelAdapter.send` (or a registry's dispatch function) in here.
 */
export interface AlertSender {
  send(message: AlertChannelMessage): Promise<void>
}

export async function dispatchAlert(
  sender: AlertSender,
  message: AlertChannelMessage,
): Promise<void> {
  await sender.send(message)
}
