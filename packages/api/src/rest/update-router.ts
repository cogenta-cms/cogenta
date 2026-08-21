import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/updates` — L22 task 9: "vérification de version disponible... mise
 * à jour en un clic depuis l'admin... historique des mises à jour et des
 * points de restauration."
 *
 * Structurally typed against `@cogenta/cli`'s `update/` module rather than
 * importing it, for the reason `site-plan-router.ts` gives for the same
 * choice against `@cogenta/agents`: the dependency arrow between these two
 * packages points one way (`@cogenta/cli` depends on `@cogenta/api`, never
 * the reverse), and this router calls three methods.
 *
 * Admin only, every route: an npm update touches the whole install, and the
 * auto-update *policy* (a closed enum) is a normal editorial setting exposed
 * through the existing `/api/settings` — this router never duplicates it.
 */

export interface UpdateContractRiskWarningLike {
  readonly version: string
  readonly excerpt: string
}

export interface UpdateContractRiskLike {
  readonly available: boolean
  readonly reason: string | undefined
  readonly scannedVersions: readonly string[]
  readonly warnings: readonly UpdateContractRiskWarningLike[]
}

export interface UpdatePackageStatusLike {
  readonly name: string
  readonly installed: string
  readonly latest: string | null
  readonly bump: string
  readonly updateAvailable: boolean
  readonly checkError: string | undefined
  readonly contractRisk: UpdateContractRiskLike | null
}

export interface UpdateCheckReportLike {
  readonly checkedAt: string
  readonly packages: readonly UpdatePackageStatusLike[]
  readonly updateAvailable: boolean
  readonly highestBump: string
  readonly contractRiskDetected: boolean
}

export interface UpdateCheckerLike {
  check(): Promise<UpdateCheckReportLike>
}

export type UpdateApplyResultLike =
  | { readonly kind: 'up-to-date'; readonly report: UpdateCheckReportLike }
  | {
      readonly kind: 'confirmation-required'
      readonly report: UpdateCheckReportLike
      readonly risky: readonly UpdatePackageStatusLike[]
    }
  | {
      readonly kind: 'applied'
      readonly report: UpdateCheckReportLike
      readonly restorePoint: {
        readonly path: string
        readonly createdAt: string
        readonly tableCount: number
        readonly rowCount: number
        readonly checksum: string
      }
      readonly installed: readonly { readonly name: string; readonly version: string }[]
    }

export interface UpdateApplierLike {
  apply(input: {
    readonly confirmBreakingChange: boolean
    readonly actorId: string | null
  }): Promise<UpdateApplyResultLike>
}

export interface RestorePointSummaryLike {
  readonly path: string
  readonly createdAt: string
  readonly rows: number
  readonly tables: number
  readonly checksum: string
  readonly encrypted: boolean
  /** `true` for a restore point `update-*` created by this system, `false` for one an operator took by hand with `cogenta backup create`. Both are shown — an update can only be as safe as whichever restore point actually precedes it. */
  readonly triggeredByUpdate: boolean
}

export interface UpdateHistoryEntryLike {
  readonly id: string
  readonly at: string
  readonly action: string
  readonly actorId: string | null
  readonly diff: Readonly<Record<string, unknown>> | null
}

export interface UpdateHistoryLike {
  entries(): Promise<readonly UpdateHistoryEntryLike[]>
  restorePoints(): Promise<readonly RestorePointSummaryLike[]>
}

export interface UpdateRouterOptions {
  readonly checker: UpdateCheckerLike
  readonly applier: UpdateApplierLike
  readonly history: UpdateHistoryLike
  readonly basePath?: string
}

export interface UpdateRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/updates'

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may check for or apply an update.',
    hint: 'An update touches the whole install. Ask an administrator.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
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
    hint: 'Update routes are GET /api/updates/status, GET /api/updates/history and POST /api/updates/apply.',
  })
}

export function createUpdateRouter(options: UpdateRouterOptions): UpdateRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const path = normalise(request.path.split('?')[0] ?? request.path)
        const method = request.method.toUpperCase()

        if (path === `${basePath}/status`) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const report = await options.checker.check()
          return jsonResponse(200, { data: report })
        }

        if (path === `${basePath}/history`) {
          if (method !== 'GET') return methodNotAllowed(['GET'])
          const [entries, restorePoints] = await Promise.all([
            options.history.entries(),
            options.history.restorePoints(),
          ])
          return jsonResponse(200, { data: { entries, restorePoints } })
        }

        if (path === `${basePath}/apply`) {
          if (method !== 'POST') return methodNotAllowed(['POST'])
          const confirmBreakingChange =
            (request.body as { confirmBreakingChange?: unknown } | undefined)
              ?.confirmBreakingChange === true
          const result = await options.applier.apply({ confirmBreakingChange, actorId: actor.id })
          return jsonResponse(200, { data: result })
        }

        throw noRoute()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
