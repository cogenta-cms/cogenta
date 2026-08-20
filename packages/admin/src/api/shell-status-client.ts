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
  readonly formSubmissionsUnread: number | null
}

export function getShellStatus(token: string): Promise<ShellStatus> {
  return request('/api/shell-status', { headers: authHeader(token) })
}
