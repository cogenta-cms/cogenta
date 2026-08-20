import { authHeader, request } from './http.js'

/**
 * `GET /api/shell-status` (fiche 35 task 3) — the admin chrome's one
 * aggregated read for every badge and feature flag it needs, instead of one
 * request per badge. Shape hand-mirrored from `@cogenta/api`'s
 * `shell-status-router.ts`, the same reason every other `*-client.ts` here
 * copies its server-side shape by hand: this is a browser bundle and that
 * package is Node code.
 */
export interface ShellStatus {
  readonly trash: number
  readonly commerceOrdersPending: number | null
  readonly commerceActive: boolean
  readonly marketplaceUpdates: number | null
  /** `null` when no collection turned `workflow: { enabled: true }` on (`schema@2.1`, ADR-0027, fiche 37). */
  readonly reviewPending: number | null
  /** Comments in `pending` moderation (contract F, ADR-0025). `null` when no collection has comments enabled. */
  readonly commentsPending: number | null
  /** Unread form submissions (contract G, ADR-0026, fiche 16). */
  readonly formSubmissionsUnread: number | null
}

export function getShellStatus(token: string): Promise<ShellStatus> {
  return request('/api/shell-status', { headers: authHeader(token) })
}
