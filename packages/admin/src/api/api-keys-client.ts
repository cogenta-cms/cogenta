import { authHeader, request } from './http.js'

/**
 * `/api/api-keys` — machine-to-machine bearer credentials, L13 task 8.
 *
 * Every call here is permission-checked on the server (admin only); nothing
 * in this file is a security boundary. The raw key only ever appears in the
 * response `createApiKey` returns — no other function in this module can
 * produce it, because no other route returns it.
 */

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
}

export interface CreatedApiKey extends AdminApiKey {
  /** Returned exactly once, by this call alone — it is stored only as a hash. */
  readonly key: string
}

export function listApiKeys(token: string): Promise<readonly AdminApiKey[]> {
  return request('/api/api-keys', { headers: authHeader(token) })
}

export function createApiKey(
  token: string,
  input: { readonly name: string; readonly scope: readonly string[]; readonly expiresAt?: string },
): Promise<CreatedApiKey> {
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
