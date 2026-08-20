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

/**
 * `/api/health-report`, `/api/migrations-status`, `/api/migrations-apply`,
 * `/api/audit-integrity`, `/api/disk-usage` and `/api/error-log` — the
 * "Santé" screen (fiche 24 tasks 1, 2, 4). Shapes hand-mirrored from
 * `@cogenta/api`'s `health-router.ts`, the same reason every other
 * `*-client.ts` here copies its server-side shape by hand: this is a browser
 * bundle and that package is Node code.
 *
 * `DoctorReport` (below) is a different, richer shape than `HealthReport`
 * above (`/api/health`'s two-driver snapshot, pre-existing) — same name
 * collision `@cogenta/cli`'s own `doctor.ts` and `serve.ts` avoid by keeping
 * `/api/health` and `/api/health-report` as two separate routes.
 */

export interface DoctorCheck {
  readonly need: string
  readonly status: 'ok' | 'degraded' | 'down'
  readonly driver: string
  readonly tier: string
  readonly reason: string
  readonly message: string | undefined
}

export interface DoctorReport {
  readonly node: string
  readonly platform: string
  readonly arch: string
  readonly configPath: string | null
  readonly site:
    | { readonly name: string; readonly url: string; readonly locales: readonly string[] }
    | undefined
  readonly checks: readonly DoctorCheck[]
  readonly notes: readonly string[]
  readonly problems: readonly string[]
}

export interface MigrationStatusItem {
  readonly id: string
  readonly name: string
  readonly applied: boolean
  readonly appliedAt?: string
  readonly destructive: boolean
  readonly impact?: string
}

export interface MigrationsStatus {
  readonly items: readonly MigrationStatusItem[]
}

export interface MigrationsApplyResult {
  readonly applied: readonly string[]
  readonly remainingDestructive: readonly string[]
}

export interface AuditIntegrityStatus {
  readonly ok: boolean
  readonly checkedAt: string
  readonly error: string | undefined
}

export interface DiskUsageStatus {
  readonly available: boolean
  readonly freeBytes?: number
  readonly totalBytes?: number
  readonly path?: string
}

export interface ErrorLogEntry {
  readonly id: string
  readonly at: string
  readonly code: string
  readonly message: string
  readonly trace: string | undefined
}

export function readHealthReport(token: string): Promise<DoctorReport> {
  return request('/api/health-report', { headers: authHeader(token) })
}

export function readMigrationsStatus(token: string): Promise<MigrationsStatus> {
  return request('/api/migrations-status', { headers: authHeader(token) })
}

export function applyMigrations(token: string): Promise<MigrationsApplyResult> {
  return request('/api/migrations-apply', { method: 'POST', headers: authHeader(token) })
}

export function readAuditIntegrity(token: string): Promise<AuditIntegrityStatus> {
  return request('/api/audit-integrity', { headers: authHeader(token) })
}

export function readDiskUsage(token: string): Promise<DiskUsageStatus> {
  return request('/api/disk-usage', { headers: authHeader(token) })
}

export function readErrorLog(
  token: string,
): Promise<{ readonly entries: readonly ErrorLogEntry[] }> {
  return request('/api/error-log', { headers: authHeader(token) })
}

export interface MaintenanceState {
  readonly enabled: boolean
  readonly message: string | null
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export function readMaintenance(token: string): Promise<MaintenanceState> {
  return request('/api/maintenance', { headers: authHeader(token) })
}

export function setMaintenance(
  token: string,
  input: { readonly enabled: boolean; readonly message?: string | null },
): Promise<MaintenanceState> {
  return request('/api/maintenance', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}
