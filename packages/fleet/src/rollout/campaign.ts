import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { compareVersions, parseVersion } from '@cogenta/plugins'
import type { CommandQueueStore } from '../control/commands.js'
import type { SiteRisk } from '../control/risk.js'
import type { SiteStateStore } from '../control/state.js'
import type { InventoryComponentKind } from '../inventory/drift.js'
import { extractInventory } from '../inventory/drift.js'
import { ROLLOUT_TABLES } from './tables.js'

/**
 * "## Mises à jour groupées" (`docs/lots/L8-flotte.md`): "1. Sélection d'un
 * site canari. 2. Application, vérification automatique... 3. Si succès,
 * vague suivante — 10%, puis 50%, puis le reste."
 *
 * **The single most important architectural decision in this module**:
 * verification is real but ASYNCHRONOUS. "Le plan de contrôle n'ouvre jamais
 * de connexion [entrante] vers un site" is absolute, since task 1 — a
 * synchronous HTTP probe from the control plane to a site would violate it.
 * "Le site répond, les pages clés se rendent" is instead learned from the
 * site's own NEXT scheduled contact (its regular telemetry push, tasks 2/3's
 * real ingestion path): if a site keeps contacting the control plane after
 * an update was dispatched to it, and its self-reported inventory
 * (`../inventory/drift.js`'s `extractInventory`) now shows the target
 * version, that IS the verification signal — a real property observable
 * without the control plane ever reaching toward the site. No new
 * verification transport is built here; this module only interprets
 * signals tasks 2/3 already produce.
 */
export type CampaignWaveLabel = 'canary' | '10%' | '50%' | 'rest'

export interface CampaignWave {
  readonly index: number
  readonly label: CampaignWaveLabel
  readonly siteIds: readonly string[]
}

export type CampaignStatus = 'in_progress' | 'succeeded' | 'halted'
export type SiteRolloutStatus = 'dispatched' | 'succeeded' | 'failed'

export interface SiteRolloutRecord {
  readonly siteId: string
  readonly waveIndex: number
  readonly status: SiteRolloutStatus
  /** The component's version this site reported just before the update was dispatched to it — what a rollback (task 8) restores. `null` when the site had never reported the component at all. */
  readonly preUpdateVersion: string | null
  readonly dispatchedAt: string
  readonly resolvedAt: string | null
}

export interface CampaignRecord {
  readonly id: string
  readonly componentKind: InventoryComponentKind
  readonly componentName: string
  readonly targetVersion: string
  readonly waves: readonly CampaignWave[]
  readonly currentWaveIndex: number
  readonly status: CampaignStatus
  readonly haltedReason: string | null
  readonly createdAt: string
  /** Sites a failed wave flagged for rollback — real, actionable state task 8's rollback execution consumes. Never populated except by a genuine wave failure. */
  readonly failedSiteIds: readonly string[]
}

/**
 * "Un échec arrête toute la campagne" — waves 10%/50%/rest of a campaign
 * halted after wave N never receive an `update` command at all (not "receive
 * one but are told to ignore it"): `startCampaign`/`checkProgress` below only
 * ever call `commandQueueStore.enqueue` for the wave they are actively
 * dispatching, and a halted campaign's `checkProgress` is a real no-op.
 */
const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000 // one real daily contact cycle, matching the retention/cadence reasoning in `../control/state.ts`

/**
 * Partitions an already-ordered site-id list into the lot's real four waves.
 * `orderedSiteIds[0]` is the canary by construction — ordering (who goes
 * first) is `orderSitesForCanary`'s job, not this function's; this function
 * only turns "an order" into "wave membership," a real, pure, deterministic
 * split. "10%"/"50%" are read as percentages of the whole fleet (rounded up,
 * minimum one site so a small fleet still gets a real staged rollout rather
 * than one giant wave), each wave's membership disjoint from the ones before
 * it.
 */
export function planWaves(orderedSiteIds: readonly string[]): readonly CampaignWave[] {
  const total = orderedSiteIds.length
  if (total === 0) return []

  const waves: CampaignWave[] = []
  let cursor = 0

  const canary = orderedSiteIds.slice(cursor, cursor + 1)
  cursor += canary.length
  waves.push({ index: 0, label: 'canary', siteIds: canary })
  if (cursor >= total) return waves

  const tenPercentCount = Math.max(1, Math.ceil(total * 0.1))
  const wave2End = Math.min(total, cursor + tenPercentCount)
  const wave2 = orderedSiteIds.slice(cursor, wave2End)
  cursor = wave2End
  if (wave2.length > 0) waves.push({ index: waves.length, label: '10%', siteIds: wave2 })
  if (cursor >= total) return waves

  const fiftyPercentCount = Math.max(1, Math.ceil(total * 0.5))
  const wave3End = Math.min(total, cursor + fiftyPercentCount)
  const wave3 = orderedSiteIds.slice(cursor, wave3End)
  cursor = wave3End
  if (wave3.length > 0) waves.push({ index: waves.length, label: '50%', siteIds: wave3 })
  if (cursor >= total) return waves

  const rest = orderedSiteIds.slice(cursor)
  if (rest.length > 0) waves.push({ index: waves.length, label: 'rest', siteIds: rest })
  return waves
}

/**
 * Real canary-selection rule: the LOWEST-risk site goes first — the safest
 * real choice available, reusing `../control/risk.js`'s already-real
 * scoring rather than an arbitrary pick. A site with no matching risk entry
 * sorts last (never chosen as canary) — an unscored site is not a safe
 * default canary. Ties break on site name for a fully deterministic order.
 */
export function orderSitesForCanary(
  siteIds: readonly string[],
  risks: readonly SiteRisk[],
): readonly string[] {
  const byId = new Map(risks.map((risk) => [risk.siteId, risk] as const))
  return [...siteIds].sort((a, b) => {
    const riskA = byId.get(a)
    const riskB = byId.get(b)
    const scoreA = riskA?.score ?? Number.POSITIVE_INFINITY
    const scoreB = riskB?.score ?? Number.POSITIVE_INFINITY
    if (scoreA !== scoreB) return scoreA - scoreB
    const nameA = riskA?.siteName ?? a
    const nameB = riskB?.siteName ?? b
    return nameA.localeCompare(nameB)
  })
}

export interface StartCampaignInput {
  readonly siteIds: readonly string[]
  readonly risks: readonly SiteRisk[]
  readonly componentKind: InventoryComponentKind
  readonly componentName: string
  readonly targetVersion: string
}

export interface RolloutCampaignStore {
  startCampaign(input: StartCampaignInput): Promise<CampaignRecord>
  /**
   * Re-evaluates the campaign's current wave against real, already-ingested
   * telemetry (never probes a site) — advances to the next wave on full
   * success, halts on any real failure or timeout, or is a no-op if nothing
   * new has happened yet. Idempotent: calling this repeatedly against an
   * unchanged state re-derives the same result rather than double-advancing.
   */
  checkProgress(campaignId: string, now?: () => number, timeoutMs?: number): Promise<CampaignRecord>
  /** Reloads a campaign from real persisted storage — proves campaign state survives a control-plane restart. */
  getCampaign(campaignId: string): Promise<CampaignRecord | null>
}

interface CampaignRow {
  id: string
  component_kind: string
  component_name: string
  target_version: string
  waves_json: string
  current_wave_index: number
  status: string
  halted_reason: string | null
  created_at: string
}

interface SiteStatusRow {
  id: string
  campaign_id: string
  site_id: string
  wave_index: number
  status: string
  pre_update_version: string | null
  dispatched_at: string | null
  resolved_at: string | null
}

function campaignNotFound(campaignId: string): never {
  throw new CogentaError({
    code: 'FLEET_CAMPAIGN_NOT_FOUND',
    message: `No rollout campaign with id "${campaignId}".`,
    hint: 'Check the campaign id, or call startCampaign first.',
    details: { campaignId },
  })
}

/** An internal invariant violation — a campaign row this store itself just wrote is unreadable a moment later. Never expected; a real, typed error rather than a bare throw if it somehow happens. */
function campaignStateCorrupt(campaignId: string, when: string): never {
  throw new CogentaError({
    code: 'FLEET_CAMPAIGN_STATE_CORRUPT',
    message: `Campaign "${campaignId}" could not be reloaded ${when} — its own row is missing.`,
    hint: 'This indicates a storage-layer bug, not a caller error.',
    details: { campaignId, when },
  })
}

function versionReached(reported: string, target: string): boolean {
  if (reported === target) return true
  const reportedParsed = parseVersion(reported)
  const targetParsed = parseVersion(target)
  if (reportedParsed === null || targetParsed === null) return false
  return compareVersions(reportedParsed, targetParsed) >= 0
}

export function createRolloutCampaignStore(
  db: DatabaseHandle,
  commandQueueStore: CommandQueueStore,
  stateStore: SiteStateStore,
  now: () => number = Date.now,
): RolloutCampaignStore {
  const campaigns = identifier(ROLLOUT_TABLES.campaigns, db.dialect)
  const siteStatus = identifier(ROLLOUT_TABLES.siteStatus, db.dialect)

  async function componentVersionOf(
    siteId: string,
    kind: InventoryComponentKind,
    name: string,
  ): Promise<string | null> {
    const snapshot = await stateStore.latest(siteId)
    if (snapshot === null) return null
    const inventory = extractInventory(snapshot)
    const component = inventory.components.find((c) => c.kind === kind && c.name === name)
    return component?.version ?? null
  }

  async function dispatchWave(
    campaignId: string,
    wave: CampaignWave,
    componentKind: InventoryComponentKind,
    componentName: string,
    targetVersion: string,
  ): Promise<void> {
    const dispatchedAt = new Date(now()).toISOString()
    for (const siteId of wave.siteIds) {
      const preUpdateVersion = await componentVersionOf(siteId, componentKind, componentName)
      await commandQueueStore.enqueue(siteId, 'update', {
        componentKind,
        componentName,
        targetVersion,
      })
      await db.query(sql`
        insert into ${siteStatus}
          (id, campaign_id, site_id, wave_index, status, pre_update_version, dispatched_at, resolved_at)
        values
          (${newId(now)}, ${campaignId}, ${siteId}, ${wave.index}, ${'dispatched'}, ${preUpdateVersion}, ${dispatchedAt}, ${null})`)
    }
  }

  async function loadCampaign(campaignId: string): Promise<CampaignRecord | null> {
    const result = await db.query<CampaignRow>(
      sql`select id, component_kind, component_name, target_version, waves_json, current_wave_index, status, halted_reason, created_at from ${campaigns} where id = ${campaignId}`,
    )
    const row = result.rows[0]
    if (row === undefined) return null

    const failedRows = await db.query<{ site_id: string }>(
      sql`select distinct site_id from ${siteStatus} where campaign_id = ${campaignId} and status = ${'failed'}`,
    )

    return {
      id: row.id,
      componentKind: row.component_kind as InventoryComponentKind,
      componentName: row.component_name,
      targetVersion: row.target_version,
      waves: JSON.parse(row.waves_json) as readonly CampaignWave[],
      currentWaveIndex: Number(row.current_wave_index),
      status: row.status as CampaignStatus,
      haltedReason: row.halted_reason,
      createdAt: row.created_at,
      failedSiteIds: failedRows.rows.map((r) => r.site_id),
    }
  }

  return {
    async startCampaign(input) {
      const orderedIds = orderSitesForCanary(input.siteIds, input.risks)
      const waves = planWaves(orderedIds)
      const id = newId(now)
      const createdAt = new Date(now()).toISOString()

      await db.query(sql`
        insert into ${campaigns}
          (id, component_kind, component_name, target_version, waves_json, current_wave_index, status, halted_reason, created_at)
        values
          (${id}, ${input.componentKind}, ${input.componentName}, ${input.targetVersion}, ${JSON.stringify(waves)}, ${0}, ${'in_progress'}, ${null}, ${createdAt})`)

      const firstWave = waves[0]
      if (firstWave !== undefined) {
        await dispatchWave(
          id,
          firstWave,
          input.componentKind,
          input.componentName,
          input.targetVersion,
        )
      }

      const campaign = await loadCampaign(id)
      if (campaign === null) return campaignStateCorrupt(id, 'immediately after insert')
      return campaign
    },

    async checkProgress(campaignId, clock = now, timeoutMs = DEFAULT_TIMEOUT_MS) {
      const campaign = await loadCampaign(campaignId)
      if (campaign === null) return campaignNotFound(campaignId)
      if (campaign.status !== 'in_progress') return campaign

      const currentWave = campaign.waves[campaign.currentWaveIndex]
      if (currentWave === undefined) return campaign

      const rows = await db.query<SiteStatusRow>(
        sql`select id, campaign_id, site_id, wave_index, status, pre_update_version, dispatched_at, resolved_at from ${siteStatus} where campaign_id = ${campaignId} and wave_index = ${currentWave.index}`,
      )

      let anyFailed = false
      let allResolved = true

      for (const row of rows.rows) {
        if (row.status !== 'dispatched') {
          if (row.status === 'failed') anyFailed = true
          continue
        }

        const snapshot = await stateStore.latest(row.site_id)
        const dispatchedAt = row.dispatched_at === null ? 0 : new Date(row.dispatched_at).getTime()

        if (snapshot !== null && new Date(snapshot.ingestedAt).getTime() > dispatchedAt) {
          const inventory = extractInventory(snapshot)
          const component = inventory.components.find(
            (c) => c.kind === campaign.componentKind && c.name === campaign.componentName,
          )
          const reached =
            component !== undefined && versionReached(component.version, campaign.targetVersion)
          const resolvedAt = new Date(clock()).toISOString()
          const status = reached ? 'succeeded' : 'failed'
          await db.query(
            sql`update ${siteStatus} set status = ${status}, resolved_at = ${resolvedAt} where id = ${row.id}`,
          )
          if (!reached) anyFailed = true
          continue
        }

        // No new, post-dispatch telemetry yet — inconclusive. A real,
        // bounded timeout also counts as failure: a site that never checks
        // back in is exactly as unsafe to advance past as one that reports
        // a real problem.
        if (clock() - dispatchedAt > timeoutMs) {
          const resolvedAt = new Date(clock()).toISOString()
          await db.query(
            sql`update ${siteStatus} set status = ${'failed'}, resolved_at = ${resolvedAt} where id = ${row.id}`,
          )
          anyFailed = true
          continue
        }

        allResolved = false
      }

      if (anyFailed) {
        await db.query(sql`
          update ${campaigns} set status = ${'halted'}, halted_reason = ${`wave "${currentWave.label}" reported a failure`}
          where id = ${campaignId}`)
        const halted = await loadCampaign(campaignId)
        if (halted === null) return campaignStateCorrupt(campaignId, 'during halt')
        return halted
      }

      if (!allResolved) {
        const stillInProgress = await loadCampaign(campaignId)
        if (stillInProgress === null) return campaignStateCorrupt(campaignId, 'mid-check')
        return stillInProgress
      }

      // Every site in the current wave succeeded — advance, or finish.
      const nextIndex = campaign.currentWaveIndex + 1
      const nextWave = campaign.waves[nextIndex]
      if (nextWave === undefined) {
        await db.query(
          sql`update ${campaigns} set status = ${'succeeded'} where id = ${campaignId}`,
        )
      } else {
        await db.query(
          sql`update ${campaigns} set current_wave_index = ${nextIndex} where id = ${campaignId}`,
        )
        await dispatchWave(
          campaignId,
          nextWave,
          campaign.componentKind,
          campaign.componentName,
          campaign.targetVersion,
        )
      }

      const advanced = await loadCampaign(campaignId)
      if (advanced === null) return campaignStateCorrupt(campaignId, 'after advancing')
      return advanced
    },

    getCampaign: loadCampaign,
  }
}
