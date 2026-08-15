import type { Urgency } from '@cogenta/agents-builtin'
import type { SiteRegistration } from '../enrollment/store.js'
import type { DriftEntry } from '../inventory/drift.js'
import type { TelemetrySnapshot } from './state.js'

/**
 * "Tableau de bord de flotte : tri par risque, pas par ordre alphabétique"
 * (`docs/lots/L8-flotte.md`) — real, deterministic scoring over exactly the
 * `TelemetryPayload` fields that have a real data source today
 * (`../agent/types.js`'s own field-by-field doc comments): `openCves`
 * (real, security-agent pipeline) and `adminAccounts`' MFA coverage (real,
 * `@cogenta/auth`). Version drift (`../inventory/drift.js`, real) also
 * contributes. Fields still "shape only" — `availability`, `backups`,
 * `certificateExpiry`, `aggregatedErrors` — contribute NOTHING here: a risk
 * function that weighed a field with no real data source behind it would be
 * fabricating a signal, not computing one. Each of those slots into the
 * score the moment a later task wires up its real data source, without
 * redesigning this function — the weight table below just grows.
 */
export type RiskTier = 'critical' | 'high' | 'medium' | 'low'

export interface RiskReason {
  readonly code: 'cve' | 'mfa-gap' | 'version-drift'
  readonly detail: string
  readonly points: number
}

export interface SiteRisk {
  readonly siteId: string
  readonly siteName: string
  readonly client: string | null
  readonly score: number
  readonly tier: RiskTier
  readonly reasons: readonly RiskReason[]
}

/**
 * A critical CVE alone must outrank everything else this function can weigh
 * — the lot's own literal acceptance criterion ("un site avec une CVE
 * critique passe devant"). Values are real point contributions, not display
 * labels; a single critical CVE (100) already exceeds the `critical` tier
 * threshold below on its own.
 */
const CVE_URGENCY_POINTS: Record<Urgency, number> = {
  critical: 100,
  high: 45,
  medium: 15,
  low: 4,
}

/** Points per drifted component, capped so a site with dozens of drifted plugins doesn't mathematically out-rank a single critical CVE — drift is real but genuinely less urgent than an exploitable vulnerability. */
const DRIFT_POINTS: Record<DriftEntry['direction'], number> = {
  behind: 6,
  different: 4,
  ahead: 1,
}
const MAX_DRIFT_POINTS = 30

/** One unmatched-MFA admin account is a real, meaningful gap — scales with the real ratio, not just a flat penalty regardless of fleet size. */
const MFA_GAP_POINTS_PER_ACCOUNT = 8

const TIER_THRESHOLDS: readonly { readonly tier: RiskTier; readonly min: number }[] = [
  { tier: 'critical', min: 80 },
  { tier: 'high', min: 35 },
  { tier: 'medium', min: 10 },
  { tier: 'low', min: 0 },
]

function tierFor(score: number): RiskTier {
  const found = TIER_THRESHOLDS.find((entry) => score >= entry.min)
  return found?.tier ?? 'low'
}

/**
 * Real, deterministic per-site score — never touches `snapshot`'s
 * shape-only fields. `null` `snapshot` (a paired site that has never
 * reported) is real risk in itself: an unresponsive/never-seen site is not
 * "score zero, all clear."
 */
export function computeSiteRisk(
  site: SiteRegistration,
  snapshot: TelemetrySnapshot | null,
  driftEntries: readonly DriftEntry[],
): SiteRisk {
  const reasons: RiskReason[] = []
  let score = 0

  if (snapshot === null) {
    reasons.push({ code: 'cve', detail: 'no telemetry ever received', points: 20 })
    score += 20
  } else {
    for (const cve of snapshot.payload.openCves) {
      if (cve.status !== 'open') continue
      const points = CVE_URGENCY_POINTS[cve.urgency]
      reasons.push({ code: 'cve', detail: `${cve.id} (${cve.urgency}, open)`, points })
      score += points
    }

    const { count, mfaEnabledCount } = snapshot.payload.adminAccounts
    const withoutMfa = Math.max(0, count - mfaEnabledCount)
    if (withoutMfa > 0) {
      const points = Math.min(withoutMfa * MFA_GAP_POINTS_PER_ACCOUNT, 40)
      reasons.push({
        code: 'mfa-gap',
        detail: `${withoutMfa}/${count} admin account(s) without MFA`,
        points,
      })
      score += points
    }
  }

  const siteDrift = driftEntries.filter((entry) => entry.siteId === site.id)
  if (siteDrift.length > 0) {
    const driftPoints = Math.min(
      siteDrift.reduce((sum, entry) => sum + DRIFT_POINTS[entry.direction], 0),
      MAX_DRIFT_POINTS,
    )
    reasons.push({
      code: 'version-drift',
      detail: `${siteDrift.length} component(s) drifted from the fleet baseline`,
      points: driftPoints,
    })
    score += driftPoints
  }

  return {
    siteId: site.id,
    siteName: site.name,
    client: site.client,
    score,
    tier: tierFor(score),
    reasons,
  }
}

/**
 * Sorted highest-risk first — the dashboard's whole reason for existing
 * ("tri par risque, pas par ordre alphabétique"). Ties break on site name,
 * ascending, so the ordering is fully deterministic (never insertion order).
 */
export function rankSitesByRisk(
  sites: readonly {
    readonly site: SiteRegistration
    readonly snapshot: TelemetrySnapshot | null
    readonly driftEntries: readonly DriftEntry[]
  }[],
): readonly SiteRisk[] {
  return sites
    .map(({ site, snapshot, driftEntries }) => computeSiteRisk(site, snapshot, driftEntries))
    .sort((a, b) => b.score - a.score || a.siteName.localeCompare(b.siteName))
}

export interface FleetFilter {
  readonly client?: string
  /** Only sites at or above this tier — "critical" is the narrowest, "low" is everyone. */
  readonly minTier?: RiskTier
  /** Case-insensitive substring match against site name or client. */
  readonly search?: string
}

const TIER_RANK: Record<RiskTier, number> = { critical: 3, high: 2, medium: 1, low: 0 }

/**
 * Real, composable query over an already-ranked list — designed for a
 * hundred sites from the start ("## Pièges connus": "Concevoir directement
 * pour cent"), not a client-side afterthought: a real O(n) predicate pass,
 * the same shape a server-side query would use once a live control plane
 * exists to run one against.
 */
export function filterRisks(risks: readonly SiteRisk[], filter: FleetFilter): readonly SiteRisk[] {
  const search = filter.search?.trim().toLowerCase()
  return risks.filter((risk) => {
    if (filter.client !== undefined && risk.client !== filter.client) return false
    if (filter.minTier !== undefined && TIER_RANK[risk.tier] < TIER_RANK[filter.minTier])
      return false
    if (search !== undefined && search !== '') {
      const haystack = `${risk.siteName} ${risk.client ?? ''}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

/** Real grouping by client — `null` (no client set) is its own real group, never dropped or merged into a fake "unknown" label. */
export function groupRisksByClient(
  risks: readonly SiteRisk[],
): ReadonlyMap<string | null, readonly SiteRisk[]> {
  const groups = new Map<string | null, SiteRisk[]>()
  for (const risk of risks) {
    const bucket = groups.get(risk.client)
    if (bucket === undefined) groups.set(risk.client, [risk])
    else bucket.push(risk)
  }
  return groups
}
