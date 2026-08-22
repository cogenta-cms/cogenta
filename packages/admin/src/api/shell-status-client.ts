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
  /** `@cogenta/core`'s own package version (fiche 22 tâche 8, part 4) — shown in the shell footer/topbar. */
  readonly cogentaVersion: string
}

/**
 * `token` is optional: the route itself answers an anonymous caller too
 * (every actor-gated field comes back `null`, `cogentaVersion` still real) —
 * `login.tsx` reads the version this same way, before there is a session to
 * send a token from.
 */
export function getShellStatus(token?: string | null): Promise<ShellStatus> {
  return request('/api/shell-status', {
    ...(token === undefined || token === null ? {} : { headers: authHeader(token) }),
  })
}
