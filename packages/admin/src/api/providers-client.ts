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
  /**
   * How this model behaves is this model's own property, not a number this
   * admin screen should have to guess for it — a reasoning-tier model can
   * spend thousands of tokens "thinking" before writing a visible answer,
   * and needs proportionally more of all three of these than a plain
   * instruct model does. Absent means "use the built-in default".
   */
  readonly maxOutputTokens?: number
  readonly requestTimeoutMs?: number
  readonly maxCorrectionAttempts?: number
  /**
   * The model this vendor renders images with, when it can. Capability is
   * derived from its presence rather than stored as a separate flag: a
   * multimodal vendor is ONE entry sharing ONE API key, never two entries and
   * never a "does images" checkbox that a record could contradict by having
   * no model to render with.
   */
  readonly imageModel?: string
  /**
   * The complete image endpoint, for a proxy. Deliberately distinct from
   * `baseUrl`: on the image side that is the full
   * `…/v1/images/generations` URL, while the text side is a different full
   * URL (chat completions). Reusing one for the other would POST an image
   * payload at a chat endpoint.
   */
  readonly imageBaseUrl?: string
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
    readonly maxOutputTokens?: number
    readonly requestTimeoutMs?: number
    readonly maxCorrectionAttempts?: number
    readonly imageModel?: string
    readonly imageBaseUrl?: string
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

/**
 * Changes model/baseUrl/tuning on an already-saved provider — never the
 * key, which is why this exists separately from `saveProvider`: the top
 * form's own POST always needs a fresh `apiKey`, so it was the only way to
 * change anything about a provider already on the table, including a
 * tuning value nobody but the admin who owns the key could otherwise touch
 * again. `null` on a tuning field clears it back to "use the built-in
 * default"; a field left out of `patch` entirely is left exactly as saved.
 *
 * The same tri-state carries the image half: `null` on `imageModel` means
 * "this vendor stops offering images" — the only way to take the capability
 * back, since it is derived from that model's presence.
 */
export function updateProviderSettings(
  token: string,
  provider: string,
  patch: {
    readonly model?: string
    readonly baseUrl?: string
    readonly maxOutputTokens?: number | null
    readonly requestTimeoutMs?: number | null
    readonly maxCorrectionAttempts?: number | null
    readonly imageModel?: string | null
    readonly imageBaseUrl?: string | null
  },
): Promise<ProviderSummary> {
  return request(`/api/providers/${encodeURIComponent(provider)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(patch),
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
