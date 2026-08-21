import { authHeader, request } from './http.js'

/**
 * `GET /api/observability` — the "Exploitation" > Observability screen
 * (fiche L22 task 5). Shape hand-mirrored from `@cogenta/api`'s
 * `observability-router.ts`, the same reason every other `*-client.ts`
 * here copies its server-side shape by hand.
 */

export interface ObservabilityTrace {
  readonly id: string
  readonly at: string
  readonly traceId: string
  readonly spanId: string
  readonly name: string
  readonly method: string | undefined
  readonly path: string | undefined
  readonly statusCode: number | undefined
  readonly durationMs: number
  readonly ok: boolean
}

export interface ObservabilityLog {
  readonly id: string
  readonly at: string
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  readonly msg: string
  readonly fields: Readonly<Record<string, unknown>> | undefined
}

export interface ObservabilitySnapshot {
  readonly enabled: boolean
  readonly traces: readonly ObservabilityTrace[]
  readonly logs: readonly ObservabilityLog[]
}

/** Admin-only on the server; a non-admin caller gets `ApiError` with a 403. */
export function readObservability(token: string): Promise<ObservabilitySnapshot> {
  return request('/api/observability', { headers: authHeader(token) })
}
