import { authHeader, request } from './http.js'

/**
 * `GET /api/security-status` and `GET /api/webhooks-status` — read-only
 * mirrors of `cogenta.config.mjs` (audit follow-up to L10 task 6 and L14
 * task 1). Both are read-only by design: see `ops-status-router.ts` for why
 * editing them from the admin would be the wrong architecture.
 */

export interface SecurityStatus {
  readonly cors: {
    readonly enabled: boolean
    readonly origins: readonly string[]
    readonly methods: readonly string[]
    readonly headers: readonly string[]
    readonly credentials: boolean
    readonly maxAge: number
  }
  readonly csp: string | false | null
  readonly hsts: {
    readonly enabled: boolean
    readonly maxAge: number
    readonly includeSubDomains: boolean
  }
  readonly pageMaxAge: number
}

export interface WebhooksStatus {
  readonly endpoints: readonly string[]
  readonly signed: boolean
  readonly disabledForMissingSecret: boolean
}

/**
 * `GET /api/trash-status` (fiche 07 task 5) — whether the trash's own
 * promise, "purged automatically", is actually kept. `lastRunAt`/`lastPurged`
 * are `null` until `runServe`'s first sweep completes.
 */
export interface TrashStatus {
  readonly retainDaysByCollection: Readonly<Record<string, number>>
  readonly lastRunAt: string | null
  readonly lastPurged: number | null
}

export function readSecurityStatus(token: string): Promise<SecurityStatus> {
  return request('/api/security-status', { headers: authHeader(token) })
}

export function readWebhooksStatus(token: string): Promise<WebhooksStatus> {
  return request('/api/webhooks-status', { headers: authHeader(token) })
}

export function readTrashStatus(token: string): Promise<TrashStatus> {
  return request('/api/trash-status', { headers: authHeader(token) })
}
