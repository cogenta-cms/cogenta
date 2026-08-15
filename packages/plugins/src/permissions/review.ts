import type { PluginManifest } from '../manifest.js'
import { describeCapability, type PluginCapabilityDescription } from './describe.js'
import type { PluginGrant, PluginGrantStore } from './grants.js'
import { detectCapabilitiesNeedingApproval } from './resolve.js'

/**
 * "Les permissions sont révisables après installation, et révocables"
 * (docs/lots/L7-extensibilite.md, task 7's own text — this is task 8's job).
 * One currently-active grant, already translated via `describeCapability`
 * (task 7) — never a raw capability string reaching a caller that renders
 * a review screen.
 */
export interface GrantedCapabilityReview {
  readonly capability: string
  readonly description: PluginCapabilityDescription
  readonly grantedAt: string
}

/**
 * The real listing this task builds: every currently-active grant for
 * `pluginName`, translated. Reuses `PluginGrantStore.listGrants` (task 5)
 * and `describeCapability` (task 7) as-is — no new persistence, no new
 * translation table.
 */
export async function listGrantedCapabilities(
  pluginName: string,
  grantStore: PluginGrantStore,
): Promise<readonly GrantedCapabilityReview[]> {
  const grants: readonly PluginGrant[] = await grantStore.listGrants(pluginName)
  return grants.map((grant) => ({
    capability: grant.capability,
    description: describeCapability(grant.capability),
    grantedAt: grant.grantedAt,
  }))
}

/**
 * Revokes `capability` for `pluginName` and reports whether it is now
 * genuinely absent from the plugin's SDK — not merely "marked revoked in a
 * table somewhere". Callers that only need the write can call
 * `PluginGrantStore.revoke` directly; this wrapper exists for the one place
 * that needs the end-to-end confirmation (a UI action that wants to know
 * the revocation actually took effect before saying so to the user).
 */
export async function revokeCapability(
  manifest: PluginManifest,
  capability: string,
  grantStore: PluginGrantStore,
): Promise<{ readonly stillGranted: boolean }> {
  await grantStore.revoke(manifest.name, capability)
  const remaining = await grantStore.listGrants(manifest.name)
  const stillGranted = remaining.some((grant) => grant.capability === capability)
  return { stillGranted }
}

/** One capability a manifest update newly declares, not yet approved — translated, with the exact string a caller needs to actually grant it. */
export interface PendingCapabilityReview {
  readonly capability: string
  readonly description: PluginCapabilityDescription
}

/**
 * "## Les mises à jour de plugins": `detectCapabilitiesNeedingApproval`
 * (task 5) already computes WHICH capabilities a new manifest declares
 * beyond what was previously granted — this is that same list, translated,
 * for a real "new permissions requested" section next to the plugin's
 * existing granted-permissions review (never re-approving is the SDK's job,
 * already handled structurally by `resolveGrantedCapabilities`; this is
 * only about making the pending set visible to a human, and giving them the
 * exact capability strings a real approval action needs).
 */
export async function describePendingApproval(
  newManifest: PluginManifest,
  grantStore: PluginGrantStore,
): Promise<readonly PendingCapabilityReview[]> {
  const currentGrants = await grantStore.listGrants(newManifest.name)
  const pending = detectCapabilitiesNeedingApproval(
    newManifest,
    currentGrants.map((grant) => grant.capability),
  )
  return pending.map((capability) => ({ capability, description: describeCapability(capability) }))
}
