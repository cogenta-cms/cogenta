import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/audit` — hand-mirrored from
 * `@cogenta/auth`'s `AuditEntry`, same reason every other `*-client.ts` in
 * this directory copies its server-side shape by hand.
 */

export interface AuditEntry {
  readonly id: string
  readonly at: string
  readonly actorId: string | null
  readonly actorRoles: readonly string[]
  readonly action: string
  readonly collection: string | null
  readonly entryId: string | null
  readonly diff: Readonly<Record<string, unknown>> | null
  readonly hash: string
  readonly previousHash: string | null
}

export interface AuditFilter {
  readonly actorId?: string
  readonly action?: string
  readonly collection?: string
  readonly since?: string
  readonly limit?: number
}

export function listAuditEntries(
  token: string,
  filter: AuditFilter = {},
): Promise<readonly AuditEntry[]> {
  const params = new URLSearchParams()
  if (filter.actorId !== undefined) params.set('actorId', filter.actorId)
  if (filter.action !== undefined) params.set('action', filter.action)
  if (filter.collection !== undefined) params.set('collection', filter.collection)
  if (filter.since !== undefined) params.set('since', filter.since)
  if (filter.limit !== undefined) params.set('limit', String(filter.limit))
  const query = params.toString()

  return request(`/api/audit${query === '' ? '' : `?${query}`}`, { headers: authHeader(token) })
}

/** Recomputes and re-chains every hash; throws (via the request layer) naming the first mismatch if the chain was tampered with. */
export function verifyAuditLog(token: string): Promise<{ readonly ok: boolean }> {
  return request('/api/audit/verify', { headers: authHeader(token) })
}

/**
 * "Mon activité" (fiche 18 task 4) — open to anyone signed in, unlike the
 * full log above. The server resolves whose activity this is from the bearer
 * token; there is no `actorId` parameter here to send, because the route
 * would ignore it anyway.
 */
export function listMyActivity(token: string, limit?: number): Promise<readonly AuditEntry[]> {
  const query = limit === undefined ? '' : `?limit=${limit}`
  return request(`/api/audit/me${query}`, { headers: authHeader(token) })
}
