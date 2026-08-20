import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/marketplace/*` (L17 tasks 1-4, fiche 29
 * tasks 1-5).
 *
 * Wire shapes are hand-mirrored from `@cogenta/api`'s `marketplace-router.ts`,
 * the same reason every other `*-client.ts` here copies its server-side shape
 * (this is a browser bundle, `@cogenta/api` is a Node package). The install
 * and update routes are the two that matter most: neither one hides a
 * refusal — `installMarketplaceItem`/`updateMarketplaceItem` let `ApiError`
 * propagate so the route component can show exactly what the server said,
 * never a guessed message.
 */

export type MarketplaceItemKind = 'plugin' | 'theme' | 'skin' | 'skill'

export interface MarketplaceChangelogEntry {
  readonly version: string
  readonly notes: string
  readonly releasedAt?: string
}

export interface MarketplaceCatalogItem {
  readonly id: string
  readonly kind: MarketplaceItemKind
  readonly displayName: string
  readonly description: string
  readonly category: string
  readonly author: string | null
  readonly screenshots: readonly string[]
  readonly changelog: readonly MarketplaceChangelogEntry[]
  readonly installed: boolean
  readonly installedVersion: string | null
}

export type MarketplaceCapabilityRisk = 'low' | 'medium' | 'high'

export interface MarketplaceCapabilityItem {
  readonly capability: string
  readonly sentence: string
  readonly riskLevel: MarketplaceCapabilityRisk
  readonly category: string
}

export interface MarketplaceItemDetail extends MarketplaceCatalogItem {
  readonly supported: boolean
  readonly signatureVerified: boolean
  readonly capabilities: readonly MarketplaceCapabilityItem[]
  readonly error: { readonly code: string; readonly message: string } | null
  /** Fiche 29 task 5 — `null` when this installation has no configured Cogenta version to check against yet, never a fabricated pass/fail. */
  readonly engineCompatible: boolean | null
  readonly latestVersion: string | null
  readonly source: 'registry' | null
}

export interface MarketplaceInstallRecord {
  readonly itemId: string
  readonly kind: MarketplaceItemKind
  readonly displayName: string
  readonly reference: string
  readonly pluginName: string | null
  readonly pluginVersion: string | null
  readonly signatureVerified: boolean
  readonly installedBy: string | null
  readonly installedAt: string
  readonly updatedAt: string
  readonly enabled: boolean
}

export interface MarketplaceUpdateResult {
  readonly record: MarketplaceInstallRecord
  readonly pendingApproval: readonly MarketplaceCapabilityItem[]
}

/** Fiche 29 task 3 — `null` fields mean "never measured yet" (no live execution pipeline has run this plugin), never a fabricated zero. */
export interface MarketplaceUsageInfo {
  readonly callCount: number
  readonly totalDurationMs: number
  readonly errorCount: number
  readonly timeoutCount: number
  readonly memoryCount: number
  readonly crashCount: number
  readonly lastRunAt: string
  readonly lastDurationMs: number
  readonly lastOutcome: string
  readonly lastError: string | null
}

export interface MarketplaceDisabledInfo {
  readonly reason: 'timeout' | 'memory' | 'crash'
  readonly details: string | null
  readonly disabledAt: string
}

export interface MarketplaceInstalledItem {
  readonly itemId: string
  readonly kind: MarketplaceItemKind
  readonly displayName: string
  readonly pluginName: string | null
  readonly pluginVersion: string | null
  readonly signatureVerified: boolean
  readonly installedBy: string | null
  readonly installedAt: string
  readonly updatedAt: string
  readonly enabled: boolean
  readonly disabled: MarketplaceDisabledInfo | null
  readonly usage: MarketplaceUsageInfo | null
  readonly latestVersion: string | null
  readonly updateAvailable: boolean
  readonly updateRequiresApproval: boolean
  readonly grantedCapabilities: readonly MarketplaceCapabilityItem[]
}

export interface MarketplaceUpdateSummaryItem {
  readonly itemId: string
  readonly displayName: string
  readonly currentVersion: string | null
  readonly latestVersion: string | null
  readonly requiresApproval: boolean
}

export interface MarketplaceUpdatesSummary {
  readonly count: number
  readonly items: readonly MarketplaceUpdateSummaryItem[]
}

export interface MarketplaceApplyUpdatesResult {
  readonly applied: readonly { readonly itemId: string; readonly pluginVersion: string | null }[]
  readonly skipped: readonly { readonly itemId: string; readonly reason: string }[]
  readonly failed: readonly { readonly itemId: string; readonly message: string }[]
}

export function listMarketplaceItems(
  token: string,
  filter: { readonly kind?: MarketplaceItemKind; readonly q?: string } = {},
): Promise<readonly MarketplaceCatalogItem[]> {
  const params = new URLSearchParams()
  if (filter.kind !== undefined) params.set('kind', filter.kind)
  if (filter.q !== undefined && filter.q.trim() !== '') params.set('q', filter.q)
  const query = params.toString()
  return request(`/api/marketplace/items${query === '' ? '' : `?${query}`}`, {
    headers: authHeader(token),
  })
}

export function getMarketplaceItem(token: string, id: string): Promise<MarketplaceItemDetail> {
  return request(`/api/marketplace/items/${encodeURIComponent(id)}`, {
    headers: authHeader(token),
  })
}

/**
 * Never swallows a signature refusal: a bad signature makes the server
 * respond 422 (`PLUGIN_SIGNATURE_INVALID`) and this throws `ApiError`, exactly
 * like every other request here. The caller shows that failure — it never
 * treats a missing thrown error as the sole signal of success.
 */
export function installMarketplaceItem(
  token: string,
  id: string,
): Promise<MarketplaceInstallRecord> {
  return request(`/api/marketplace/items/${encodeURIComponent(id)}/install`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

/**
 * Without `confirmPendingPermissions`, an update that would widen
 * capabilities throws `ApiError` with `code === 'MARKETPLACE_UPDATE_REQUIRES_APPROVAL'`.
 * `CogentaError.details` is deliberately never serialised to a client
 * (`errorResponse` in `@cogenta/api`'s `rest/http.ts`), so the route
 * component never reads a byte-exact delta off the caught error — it shows
 * the full requested capability set already fetched via `getMarketplaceItem`
 * instead, then calls this again with `confirmPendingPermissions: true` only
 * after the admin explicitly confirms on screen.
 */
export function updateMarketplaceItem(
  token: string,
  id: string,
  options: { readonly confirmPendingPermissions?: boolean } = {},
): Promise<MarketplaceUpdateResult> {
  return request(`/api/marketplace/items/${encodeURIComponent(id)}/update`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({
      confirmPendingPermissions: options.confirmPendingPermissions === true,
    }),
  })
}

export async function uninstallMarketplaceItem(
  token: string,
  id: string,
  options: { readonly removeData?: boolean } = {},
): Promise<void> {
  await request(`/api/marketplace/items/${encodeURIComponent(id)}/uninstall`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ removeData: options.removeData === true }),
  })
}

/** Fiche 29 task 1 — the manual half of "activer/désactiver"; independent of an automatic `PluginDisableStore` violation. */
export function activateMarketplaceItem(
  token: string,
  id: string,
): Promise<MarketplaceInstallRecord> {
  return request(`/api/marketplace/items/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function deactivateMarketplaceItem(
  token: string,
  id: string,
): Promise<MarketplaceInstallRecord> {
  return request(`/api/marketplace/items/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

/** Fiche 29 task 1 — "savoir en un écran ce qui tourne, dans quelle version, avec quels droits." */
export function listInstalledMarketplaceItems(
  token: string,
): Promise<readonly MarketplaceInstalledItem[]> {
  return request('/api/marketplace/installed', { headers: authHeader(token) })
}

/** Fiche 29 task 2 — the count this powers a "N updates available" signal from. */
export function getMarketplaceUpdates(token: string): Promise<MarketplaceUpdatesSummary> {
  return request('/api/marketplace/updates', { headers: authHeader(token) })
}

/**
 * Fiche 29 task 2 — grouped update, **except** anything that would widen
 * permissions (`requiresApproval`), which the server always reports back in
 * `skipped` rather than silently applying. Those stay one-by-one, through
 * `updateMarketplaceItem` with an explicit `confirmPendingPermissions: true`.
 */
export function applyMarketplaceUpdates(token: string): Promise<MarketplaceApplyUpdatesResult> {
  return request('/api/marketplace/updates/apply', {
    method: 'POST',
    headers: authHeader(token),
  })
}
