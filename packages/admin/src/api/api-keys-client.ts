import { authHeader, request } from './http.js'

/**
 * `/api/api-keys` — machine-to-machine bearer credentials, L13 task 8;
 * expiry defaults, rotation, quota and usage added by fiche 20.
 *
 * Every call here is permission-checked on the server (admin only); nothing
 * in this file is a security boundary. The raw key only ever appears in the
 * response `createApiKey` and `rotateApiKey` return — no other function in
 * this module can produce it, because no other route returns it.
 */

export interface ApiKeyUsage {
  readonly last7Days: number
  readonly last30Days: number
}

export interface AdminApiKey {
  readonly id: string
  readonly name: string
  readonly prefix: string
  readonly scope: readonly string[]
  readonly createdBy: string | null
  readonly createdAt: string
  readonly expiresAt: string | null
  readonly revokedAt: string | null
  readonly lastUsedAt: string | null
  readonly rateLimitPerMinute: number
  /** The id of the key that replaced this one, once rotated. `null` otherwise. */
  readonly supersededBy: string | null
  readonly usage: ApiKeyUsage
}

export interface CreatedApiKey extends AdminApiKey {
  /** Returned exactly once, by this call alone — it is stored only as a hash. */
  readonly key: string
}

export interface RotatedApiKey {
  readonly issued: CreatedApiKey
  readonly previous: AdminApiKey
}

export function listApiKeys(token: string): Promise<readonly AdminApiKey[]> {
  return request('/api/api-keys', { headers: authHeader(token) })
}

export interface CreateApiKeyInput {
  readonly name: string
  readonly scope: readonly string[]
  /** ISO timestamp. Omit both this and `neverExpires` for the 90-day default. */
  readonly expiresAt?: string
  /** Explicit opt-out of any expiry. Mutually exclusive with `expiresAt`. */
  readonly neverExpires?: boolean
  /** Requests per minute. Omit for the site's default quota. */
  readonly rateLimitPerMinute?: number
}

export function createApiKey(token: string, input: CreateApiKeyInput): Promise<CreatedApiKey> {
  return request('/api/api-keys', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function revokeApiKey(token: string, id: string): Promise<void> {
  await request(`/api/api-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

/** "Faire tourner cette clé" — mints a replacement, and puts the original on a grace window of `graceHours`. */
export function rotateApiKey(
  token: string,
  id: string,
  graceHours: number,
): Promise<RotatedApiKey> {
  return request(`/api/api-keys/${encodeURIComponent(id)}/rotate`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ graceHours }),
  })
}
