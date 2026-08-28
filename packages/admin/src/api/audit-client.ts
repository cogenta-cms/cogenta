import type { ContentDiff } from './content-client.js'
import { API_BASE, ApiError, authHeader, request, requestBody } from './http.js'

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
  /** `null` for an action that never produced a content version — fiche 21 task 1. */
  readonly version: number | null
  readonly hash: string
  readonly previousHash: string | null
}

/** Fiche 21 task 4 — who or what an entry names, mirrored from `classifyAuditActor` in `@cogenta/auth`. */
export type AuditActorKind = 'human' | 'agent' | 'api_key' | 'system'

export interface AuditFilter {
  readonly actorId?: string
  readonly action?: string
  readonly collection?: string
  readonly since?: string
  /** Upper bound on `at` — the other half of the date-range filter (task 2). */
  readonly until?: string
  /** Task 4's dedicated filter. */
  readonly actorKind?: AuditActorKind
  readonly limit?: number
  /** Opaque — always the previous page's `nextCursor`, never constructed by hand (fiche 67 task 1). */
  readonly after?: string
}

function filterParams(filter: AuditFilter): URLSearchParams {
  const params = new URLSearchParams()
  if (filter.actorId !== undefined) params.set('actorId', filter.actorId)
  if (filter.action !== undefined) params.set('action', filter.action)
  if (filter.collection !== undefined) params.set('collection', filter.collection)
  if (filter.since !== undefined) params.set('since', filter.since)
  if (filter.until !== undefined) params.set('until', filter.until)
  if (filter.actorKind !== undefined) params.set('actorKind', filter.actorKind)
  if (filter.limit !== undefined) params.set('limit', String(filter.limit))
  if (filter.after !== undefined) params.set('after', filter.after)
  return params
}

/**
 * Kept returning a plain array, byte for byte, for callers that only ever
 * wanted "every recent entry matching this filter" without caring about a
 * cursor — `dashboard.tsx`'s activity widget and `trash.tsx` among them.
 * `listAuditEntriesPage` below is the one the audit screen itself uses for
 * real pagination (fiche 67 task 1), same split as `listUsers`/`listUsersPage`.
 */
export function listAuditEntries(
  token: string,
  filter: AuditFilter = {},
): Promise<readonly AuditEntry[]> {
  const query = filterParams(filter).toString()
  return request(`/api/audit${query === '' ? '' : `?${query}`}`, { headers: authHeader(token) })
}

export interface AuditEntriesPage {
  readonly entries: readonly AuditEntry[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
}

export async function listAuditEntriesPage(
  token: string,
  filter: AuditFilter = {},
): Promise<AuditEntriesPage> {
  const query = filterParams(filter).toString()
  const response = await requestBody<{
    data: readonly AuditEntry[]
    page: { hasMore: boolean; nextCursor: string | null }
  }>(`/api/audit${query === '' ? '' : `?${query}`}`, { headers: authHeader(token) })
  return {
    entries: response.data,
    hasMore: response.page.hasMore,
    nextCursor: response.page.nextCursor,
  }
}

/** Recomputes and re-chains every hash; throws (via the request layer) naming the first mismatch if the chain was tampered with. */
export function verifyAuditLog(token: string): Promise<{ readonly ok: boolean }> {
  return request('/api/audit/verify', { headers: authHeader(token) })
}

/**
 * Fiche 21 task 1 — one entry's full detail: the resolved actor kind and
 * label, the entry's own fields, and — when the action produced a content
 * version and the site is not held back by a permission it never granted
 * `admin` on this collection — the structural diff `GET .../diff` already
 * computes. Never recomputed here: `diff` is exactly that route's output,
 * passed through.
 */
export interface AuditEntryDetail {
  readonly entry: AuditEntry
  readonly actorKind: AuditActorKind
  /** An email, an API key's name, or `null` when it could not be resolved (or there is no actor). */
  readonly actorLabel: string | null
  readonly diff: ContentDiff | null
  /** Why `diff` is `null`, when it is — `null` itself when a diff was returned. */
  readonly diffUnavailable: string | null
}

export function getAuditEntryDetail(token: string, id: string): Promise<AuditEntryDetail> {
  return request(`/api/audit/${encodeURIComponent(id)}`, { headers: authHeader(token) })
}

/**
 * Fiche 21 task 3 — the scheduled check's last outcome and, via `run`, a
 * way to trigger a fresh (persisted, full) one on demand. `null` means the
 * site never wired one up (an embedder that did not pass `integrity` to
 * `createAuditRouter`), not that it is broken.
 */
export interface AuditIntegrityStatus {
  readonly state: 'never-run' | 'ok' | 'broken'
  readonly checkpoint: { readonly id: string; readonly at: string; readonly hash: string } | null
  readonly entriesChecked: number
  readonly lastCheckedAt: string | null
  readonly lastMode: 'incremental' | 'full' | null
  readonly lastFullCheckedAt: string | null
  readonly brokenAt: string | null
  readonly brokenEntryId: string | null
  readonly brokenMessage: string | null
}

export function getAuditIntegrityStatus(token: string): Promise<AuditIntegrityStatus | null> {
  return request('/api/audit/integrity', { headers: authHeader(token) })
}

/** Forces a full, persisted re-check right now — the admin's "vérifier maintenant". */
export function runAuditIntegrityCheck(token: string): Promise<AuditIntegrityStatus> {
  return request('/api/audit/integrity', { method: 'POST', headers: authHeader(token) })
}

/**
 * Fiche 21 task 2 — the filtered view as a file, fetched (not linked
 * directly: the route needs the bearer token a plain `<a href>` cannot
 * carry) and handed to the browser as a download.
 *
 * Every export is itself journalled server-side (`audit.export`), so
 * nothing more needs to happen here once the file is in the visitor's hands.
 */
export async function exportAuditLog(
  token: string,
  format: 'csv' | 'json',
  filter: AuditFilter = {},
): Promise<void> {
  const params = filterParams(filter)
  params.set('format', format)
  const response = await fetch(`${API_BASE}/api/audit/export?${params.toString()}`, {
    headers: authHeader(token),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      readonly error?: { readonly code?: string; readonly message?: string; readonly hint?: string }
    } | null
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL',
      body?.error?.message ?? 'The export could not be completed.',
      body?.error?.hint,
    )
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit-log.${format}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
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
