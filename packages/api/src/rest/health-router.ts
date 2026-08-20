import { CogentaError } from '@cogenta/core'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `GET /api/health-report`, `GET /api/migrations-status`,
 * `POST /api/migrations-apply`, `GET /api/audit-integrity` and
 * `GET /api/error-log` — the "Santé" admin screen (fiche 24 tasks 1, 2, 4).
 *
 * Every computation is injected rather than done here, the same shape
 * `ops-status-router.ts` already uses: this router is HTTP shape only. The
 * point that matters for task 1's acceptance criterion — "le diagnostic de
 * l'admin est le même code que `cogenta doctor`" — lives in the caller
 * (`cogenta serve`), which passes `getReport` as `() => runDoctor(...)`, the
 * literal function `cogenta doctor` calls. Nothing here re-derives a driver's
 * health a second way.
 */

export interface HealthDoctorCheck {
  readonly need: string
  readonly status: 'ok' | 'degraded' | 'down'
  readonly driver: string
  readonly tier: string
  readonly reason: string
  readonly message: string | undefined
}

export interface HealthReportLike {
  readonly node: string
  readonly platform: string
  readonly arch: string
  readonly configPath: string | null
  readonly site: { name: string; url: string; locales: readonly string[] } | undefined
  readonly checks: readonly HealthDoctorCheck[]
  readonly notes: readonly string[]
  readonly problems: readonly string[]
}

export interface MigrationStatusLike {
  readonly id: string
  readonly name: string
  readonly applied: boolean
  readonly appliedAt?: string
  readonly destructive: boolean
  readonly impact?: string
}

export interface MigrationsStatus {
  readonly items: readonly MigrationStatusLike[]
}

export interface MigrationsApplyResult {
  /** Ids applied by this call, in order. Empty when nothing not-destructive was pending. */
  readonly applied: readonly string[]
  /** Ids of pending destructive migrations this call deliberately did not touch. */
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

export interface ErrorLogEntryLike {
  readonly id: string
  readonly at: string
  readonly code: string
  readonly message: string
  readonly trace: string | undefined
}

export interface MaintenanceStateLike {
  readonly enabled: boolean
  readonly message: string | null
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export interface SetMaintenanceInputLike {
  readonly enabled: boolean
  readonly message?: string | null
}

export interface HealthRouterOptions {
  readonly getReport: () => Promise<HealthReportLike>
  readonly getMigrations?: () => Promise<MigrationsStatus>
  /** Absent means "this instance has no migrations wired" — the route then answers an empty list rather than 500. */
  readonly applyMigrations?: () => Promise<MigrationsApplyResult>
  readonly getAuditIntegrity?: () => Promise<AuditIntegrityStatus>
  readonly getDiskUsage?: () => Promise<DiskUsageStatus>
  readonly getErrorLog?: () => readonly ErrorLogEntryLike[]
  /** Maintenance mode (fiche 24 task 5) — the on/off switch `cogenta serve`'s request handler reads on every request. */
  readonly getMaintenance?: () => Promise<MaintenanceStateLike>
  readonly setMaintenance?: (
    input: SetMaintenanceInputLike,
    actorId: string | null,
  ) => Promise<MaintenanceStateLike>
  readonly reportPath?: string
  readonly migrationsStatusPath?: string
  readonly migrationsApplyPath?: string
  readonly auditIntegrityPath?: string
  readonly diskUsagePath?: string
  readonly errorLogPath?: string
  readonly maintenancePath?: string
}

export interface HealthRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_REPORT_PATH = '/api/health-report'
const DEFAULT_MIGRATIONS_STATUS_PATH = '/api/migrations-status'
const DEFAULT_MIGRATIONS_APPLY_PATH = '/api/migrations-apply'
const DEFAULT_AUDIT_INTEGRITY_PATH = '/api/audit-integrity'
const DEFAULT_DISK_USAGE_PATH = '/api/disk-usage'
const DEFAULT_ERROR_LOG_PATH = '/api/error-log'
const DEFAULT_MAINTENANCE_PATH = '/api/maintenance'

function forbidden(context: AccessContext, what: string): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: `Access denied: ${what} can only be read by the admin role.`,
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext, what: string): void {
  if (context.actor.roles.includes('admin')) return
  throw forbidden(context, what)
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'The health routes are GET /api/health-report, GET /api/migrations-status, POST /api/migrations-apply, GET /api/audit-integrity, GET /api/disk-usage, GET /api/error-log and GET|POST /api/maintenance.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function createHealthRouter(options: HealthRouterOptions): HealthRouter {
  const reportPath = normalise(options.reportPath ?? DEFAULT_REPORT_PATH)
  const migrationsStatusPath = normalise(
    options.migrationsStatusPath ?? DEFAULT_MIGRATIONS_STATUS_PATH,
  )
  const migrationsApplyPath = normalise(
    options.migrationsApplyPath ?? DEFAULT_MIGRATIONS_APPLY_PATH,
  )
  const auditIntegrityPath = normalise(options.auditIntegrityPath ?? DEFAULT_AUDIT_INTEGRITY_PATH)
  const diskUsagePath = normalise(options.diskUsagePath ?? DEFAULT_DISK_USAGE_PATH)
  const errorLogPath = normalise(options.errorLogPath ?? DEFAULT_ERROR_LOG_PATH)
  const maintenancePath = normalise(options.maintenancePath ?? DEFAULT_MAINTENANCE_PATH)

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        return await route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  async function route(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const path = normalise(request.path.split('?')[0] ?? request.path)
    const method = request.method.toUpperCase()

    if (path === reportPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the site health report')
      const report = await options.getReport()
      return jsonResponse(200, { data: report })
    }

    if (path === migrationsStatusPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the migration status')
      const status =
        options.getMigrations === undefined ? { items: [] } : await options.getMigrations()
      return jsonResponse(200, { data: status })
    }

    if (path === migrationsApplyPath) {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      assertAdmin(context, 'applying migrations')
      if (options.applyMigrations === undefined) {
        return jsonResponse(200, { data: { applied: [], remainingDestructive: [] } })
      }
      const result = await options.applyMigrations()
      return jsonResponse(200, { data: result })
    }

    if (path === auditIntegrityPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the audit integrity check')
      const status =
        options.getAuditIntegrity === undefined
          ? { ok: true, checkedAt: new Date(0).toISOString(), error: 'no audit log configured' }
          : await options.getAuditIntegrity()
      return jsonResponse(200, { data: status })
    }

    if (path === diskUsagePath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the storage disk usage')
      const status =
        options.getDiskUsage === undefined ? { available: false } : await options.getDiskUsage()
      return jsonResponse(200, { data: status })
    }

    if (path === errorLogPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the server error log')
      const entries = options.getErrorLog === undefined ? [] : options.getErrorLog()
      return jsonResponse(200, { data: { entries } })
    }

    if (path === maintenancePath) {
      if (method === 'GET') {
        assertAdmin(context, 'the maintenance mode switch')
        const state =
          options.getMaintenance === undefined
            ? {
                enabled: false,
                message: null,
                updatedAt: new Date(0).toISOString(),
                updatedBy: null,
              }
            : await options.getMaintenance()
        return jsonResponse(200, { data: state })
      }
      if (method === 'POST') {
        assertAdmin(context, 'the maintenance mode switch')
        if (options.setMaintenance === undefined) {
          throw new CogentaError({
            code: 'CONTENT_READ_ONLY',
            message: 'This instance has no maintenance mode switch wired.',
            hint: 'Only `cogenta serve` wires this route.',
          })
        }
        const body = (request.body ?? {}) as {
          readonly enabled?: unknown
          readonly message?: unknown
        }
        if (typeof body.enabled !== 'boolean') {
          throw new CogentaError({
            code: 'QUERY_INVALID',
            message: '"enabled" must be a boolean.',
            hint: 'Send { "enabled": true, "message": "optional text" }.',
          })
        }
        const state = await options.setMaintenance(
          {
            enabled: body.enabled,
            ...(body.message === undefined
              ? {}
              : { message: body.message === null ? null : String(body.message) }),
          },
          context.actor.id,
        )
        return jsonResponse(200, { data: state })
      }
      return methodNotAllowed(['GET', 'POST'])
    }

    throw noRoute()
  }
}
