import { authHeader, request } from './http.js'

/**
 * `/api/updates` — L22 task 9. Admin-only version checking and one-click
 * updating for this site's own `@cogenta/core`/`@cogenta/cli` install, with
 * a mandatory restore point before anything is applied.
 */

export type UpdateBump = 'none' | 'patch' | 'minor' | 'major' | 'unknown'

export interface UpdateContractRiskWarning {
  readonly version: string
  readonly excerpt: string
}

export interface UpdateContractRisk {
  readonly available: boolean
  readonly reason: string | undefined
  readonly scannedVersions: readonly string[]
  readonly warnings: readonly UpdateContractRiskWarning[]
}

export interface UpdatePackageStatus {
  readonly name: string
  readonly installed: string
  readonly latest: string | null
  readonly bump: UpdateBump
  readonly updateAvailable: boolean
  readonly checkError: string | undefined
  readonly contractRisk: UpdateContractRisk | null
}

export interface UpdateCheckReport {
  readonly checkedAt: string
  readonly packages: readonly UpdatePackageStatus[]
  readonly updateAvailable: boolean
  readonly highestBump: UpdateBump
  readonly contractRiskDetected: boolean
}

export type UpdateApplyResult =
  | { readonly kind: 'up-to-date'; readonly report: UpdateCheckReport }
  | {
      readonly kind: 'confirmation-required'
      readonly report: UpdateCheckReport
      readonly risky: readonly UpdatePackageStatus[]
    }
  | {
      readonly kind: 'applied'
      readonly report: UpdateCheckReport
      readonly restorePoint: {
        readonly path: string
        readonly createdAt: string
        readonly tableCount: number
        readonly rowCount: number
        readonly checksum: string
      }
      readonly installed: readonly { readonly name: string; readonly version: string }[]
    }

export interface UpdateHistoryEntry {
  readonly id: string
  readonly at: string
  readonly action: string
  readonly actorId: string | null
  readonly diff: Readonly<Record<string, unknown>> | null
}

export interface RestorePointSummary {
  readonly path: string
  readonly createdAt: string
  readonly rows: number
  readonly tables: number
  readonly checksum: string
  readonly encrypted: boolean
  readonly triggeredByUpdate: boolean
}

export interface UpdateHistory {
  readonly entries: readonly UpdateHistoryEntry[]
  readonly restorePoints: readonly RestorePointSummary[]
}

export function readUpdateStatus(token: string): Promise<UpdateCheckReport> {
  return request('/api/updates/status', { headers: authHeader(token) })
}

export function readUpdateHistory(token: string): Promise<UpdateHistory> {
  return request('/api/updates/history', { headers: authHeader(token) })
}

export function applyUpdateNow(
  token: string,
  confirmBreakingChange: boolean,
): Promise<UpdateApplyResult> {
  return request('/api/updates/apply', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ confirmBreakingChange }),
  })
}
