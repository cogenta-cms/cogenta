import { authHeader, request } from './http.js'

/** Mirrors `@cogenta/core`'s `HealthReport` — status of one driver `cogenta serve` actually selected, not a synthetic uptime number. */
export interface HealthReport {
  readonly status: 'ok' | 'degraded' | 'down'
  readonly driver: string
  readonly tier: string
  readonly latencyMs?: number
  readonly message?: string
}

export interface SiteHealth {
  readonly database: HealthReport
  readonly storage: HealthReport
}

/** Admin-only on the server; a non-admin caller gets `ApiError` with a 403. */
export function getSiteHealth(token: string): Promise<SiteHealth> {
  return request('/api/health', { headers: authHeader(token) })
}
