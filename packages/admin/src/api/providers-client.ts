import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/providers` — L22 task 1bis's "Providers"
 * screen. Hand-mirrored from `@cogenta/api`'s `providers-router.ts`, same
 * reason every other `*-client.ts` in this directory copies its
 * server-side shape by hand.
 *
 * Fiche 56: the built-in provider list used to be a hand-copied constant
 * here (`KNOWN_PROVIDERS`) that had to be kept in sync with
 * `@cogenta/agents`' own `PROVIDER_NAMES` by hand — exactly the
 * desynchronisation risk this repo already hit once with
 * `CONTRACT_C_PERMISSIONS`. `getProviderCatalog` reads it from the server
 * instead; nothing in this file hard-codes a provider id any more.
 */

export type ProviderWireFormat = 'openai-compatible' | 'anthropic' | 'google'

export interface ProviderCatalogEntry {
  readonly id: string
  readonly label: string
  readonly wireFormat: ProviderWireFormat
  readonly defaultBaseUrl: string
  readonly knownModels: readonly string[]
}

export interface ProviderSummary {
  readonly provider: string
  readonly enabled: boolean
  readonly model: string
  readonly baseUrl?: string
  /** Never the real key — the last 4 characters only, e.g. "••••cdef". */
  readonly maskedKey: string
  readonly updatedAt: string
}

export function getProviderCatalog(token: string): Promise<readonly ProviderCatalogEntry[]> {
  return request('/api/providers/catalog', { headers: authHeader(token) })
}

export function listProviders(token: string): Promise<readonly ProviderSummary[]> {
  return request('/api/providers', { headers: authHeader(token) })
}

export function saveProvider(
  token: string,
  input: {
    readonly provider: string
    readonly apiKey: string
    readonly model: string
    readonly baseUrl?: string
    readonly enabled?: boolean
  },
): Promise<ProviderSummary> {
  return request('/api/providers', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function setProviderEnabled(
  token: string,
  provider: string,
  enabled: boolean,
): Promise<ProviderSummary> {
  return request(`/api/providers/${encodeURIComponent(provider)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ enabled }),
  })
}

export function updateProviderModel(
  token: string,
  provider: string,
  model: string,
): Promise<ProviderSummary> {
  return request(`/api/providers/${encodeURIComponent(provider)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ model }),
  })
}

export function removeProvider(
  token: string,
  provider: string,
): Promise<{ readonly provider: string }> {
  return request(`/api/providers/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}
