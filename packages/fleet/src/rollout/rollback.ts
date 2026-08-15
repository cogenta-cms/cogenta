import { CogentaError } from '@cogenta/core'
import type { CommandQueueStore, FleetCommand } from '../control/commands.js'
import type { InventoryComponentKind } from '../inventory/drift.js'
import type { CampaignRecord, RolloutCampaignStore } from './campaign.js'

/**
 * "## Mises à jour groupées" (`docs/lots/L8-flotte.md`): "Un échec arrête
 * toute la campagne et **propose** le retour arrière du site concerné."
 *
 * "Propose", not "déclenche" — a halted campaign never auto-enqueues a
 * rollback by itself. An unattended automatic rollback of what might be a
 * transient contact failure (task 7's `checkProgress` treats "no telemetry
 * within the timeout" the same as a real reported failure, and a real
 * network hiccup is a legitimate transient cause) is a real operational risk
 * the lot's own words don't ask for. `listRollbackCandidates` below is the
 * "propose" half — real, queryable data, never an action by itself.
 * `triggerRollback` is the real, separate act a human (or, later, some
 * explicit automation a deployer opts into) performs deliberately.
 */
export interface RollbackCandidate {
  readonly siteId: string
  readonly componentKind: InventoryComponentKind
  readonly componentName: string
  /** What this site reported for the component just before the campaign updated it — `null` when the site had never reported it at all, in which case there is nothing real to roll back to. */
  readonly rollbackToVersion: string | null
}

/**
 * Real rollback candidates for a halted campaign — one entry per site the
 * campaign's own real wave-verification flagged as failed
 * (`CampaignRecord.failedSiteIds`, task 7), each carrying the real version
 * that same site reported immediately before this campaign touched it
 * (`SiteRolloutRecord.preUpdateVersion`, task 7's own per-site history — not
 * `../control/state.js`'s general drift-tracking history, which has no
 * concept of "before THIS campaign"). Returns an empty list for a campaign
 * that is not halted — there is nothing to propose while it is still
 * running or after it fully succeeded.
 */
export async function listRollbackCandidates(
  campaignStore: RolloutCampaignStore,
  campaign: CampaignRecord,
): Promise<readonly RollbackCandidate[]> {
  if (campaign.status !== 'halted') return []

  const candidates: RollbackCandidate[] = []
  for (const siteId of campaign.failedSiteIds) {
    const records = await campaignStore.getSiteRolloutRecords(campaign.id, siteId)
    // A site appears at most once per campaign in practice (task 7's wave
    // partition is disjoint) — the failed/most recent record is the real
    // one to read "what it reported right before this campaign" from.
    const record = records.at(-1)
    candidates.push({
      siteId,
      componentKind: campaign.componentKind,
      componentName: campaign.componentName,
      rollbackToVersion: record?.preUpdateVersion ?? null,
    })
  }
  return candidates
}

/**
 * Enqueues a real, signed `rollback` command (task 6's real command-queue
 * primitive) for exactly one site — strictly per-site, the same isolation
 * discipline every prior L8 task has held: there is no "roll back the whole
 * fleet" operation, matching "## Mises à jour groupées"'s own words
 * verbatim: "Chaque site conserve son propre historique de version et peut
 * être revenu en arrière indépendamment. Il n'existe pas d'état global à
 * restaurer." Callable standalone, independent of any campaign — an
 * operator deciding a specific site needs to go back does not need a
 * campaign to exist at all; `listRollbackCandidates` above is one real way
 * to arrive at the right `(siteId, componentKind, componentName, version)`
 * tuple, not the only way to call this.
 */
export async function triggerRollback(
  commandQueueStore: CommandQueueStore,
  siteId: string,
  componentKind: InventoryComponentKind,
  componentName: string,
  rollbackToVersion: string | null,
): Promise<FleetCommand> {
  if (rollbackToVersion === null) {
    throw new CogentaError({
      code: 'FLEET_ROLLBACK_NO_PRIOR_VERSION',
      message: `No prior version is known for "${componentName}" on site "${siteId}" — nothing to roll back to.`,
      hint: 'A rollback needs a real, previously-reported version. Check the site actually reported this component before the change that needs reverting.',
      details: { siteId, componentKind, componentName },
    })
  }
  return await commandQueueStore.enqueue(siteId, 'rollback', {
    componentKind,
    componentName,
    targetVersion: rollbackToVersion,
  })
}
