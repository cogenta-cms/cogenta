import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/marketplace/*` (L17 tasks 1-4).
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
}

export interface MarketplaceCatalogItem {
  readonly id: string
  readonly kind: MarketplaceItemKind
  readonly displayName: string
  readonly description: string
  readonly category: string
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
}

export interface MarketplaceUpdateResult {
  readonly record: MarketplaceInstallRecord
  readonly pendingApproval: readonly MarketplaceCapabilityItem[]
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
 * capabilities throws `ApiError` with `code === 'MARKETPLACE_UPDATE_REQUIRES_APPROVAL'`
 * and `details.pending` carrying the newly-requested capabilities — the
 * route component reads that off the caught error to render the diff, then
 * calls this again with `confirmPendingPermissions: true` only after the
 * admin explicitly confirms on screen.
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

export async function uninstallMarketplaceItem(token: string, id: string): Promise<void> {
  await request(`/api/marketplace/items/${encodeURIComponent(id)}/uninstall`, {
    method: 'POST',
    headers: authHeader(token),
  })
}
