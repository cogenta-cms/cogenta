import { CogentaError } from '@cogenta/core'
import {
  CONTENT_ACTIONS,
  type ContentAction,
  type RolePermissionOverlay,
  type RolePermissionOverrideRecord,
  type RolePermissionStore,
  type RolePermissionTargetType,
} from '@cogenta/schema'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/role-permissions` — fiche 63, ADR-0028: an `admin` writes a role's
 * grant on a collection or taxonomy action straight to the database, applied
 * on the very next request, no deploy cycle.
 *
 *   GET    /api/role-permissions                             every override this site has
 *   PUT    /api/role-permissions                              write one override
 *   DELETE /api/role-permissions/{targetType}/{targetName}/{action}   revert to the file
 *
 * Every route needs `admin` — not `editor`, unlike the menu router's write
 * gate: a permission override is a change to *who may do what*, a different
 * class of privilege than editing navigation. Validation of the candidate
 * itself (role names, the action vocabulary, `own` only on a collection) is
 * `RolePermissionStore.set`'s job, reusing `defineCollection`/
 * `defineTaxonomy` — this router only shapes the HTTP request into that
 * call and never re-checks what the store already checks (task 4: no second
 * validation logic).
 *
 * The `own` in the entry is used only by `permissions.ts` to answer
 * `PermissionLayer.can()`'s question; recording *why* it changed and *who*
 * changed it is `cogenta serve`'s job (`recordRolePermissionAudit`,
 * mirroring every other write route's audit hook) — this router stays a
 * plain door onto the store, the same shape `menu-router.ts` and
 * `redirect-router.ts` already are.
 */

export interface RolePermissionRouterOptions {
  readonly store: RolePermissionStore
  /**
   * Refreshed after every successful write so the very next request already
   * sees it — the live re-read `PermissionLayer` was built to consult.
   * Absent only in a test harness that does not wire the overlay in; a
   * write still lands in the database, it is simply not felt until the
   * process restarts (or something else calls `refresh()`).
   */
  readonly overlay?: RolePermissionOverlay
  /** Mount point. `/api/role-permissions` by default. */
  readonly basePath?: string
}

export interface RolePermissionRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/role-permissions'
const TARGET_TYPES: readonly RolePermissionTargetType[] = ['collection', 'taxonomy']
const ACTION_SET: ReadonlySet<string> = new Set(CONTENT_ACTIONS)

interface SerialisedOverride {
  readonly targetType: RolePermissionTargetType
  readonly targetName: string
  readonly action: ContentAction
  readonly roles: readonly string[]
  readonly own: boolean
  readonly updatedAt: string
  readonly updatedBy: string | null
}

function serialise(record: RolePermissionOverrideRecord): SerialisedOverride {
  return { ...record }
}

function invalidBody(what: string, hint: string): CogentaError {
  return new CogentaError({ code: 'ROLE_PERMISSION_INVALID', message: what, hint })
}

function forbidden(context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: 'Access denied: role permission overrides can only be written by admin.',
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext): void {
  if (context.actor.roles.includes('admin')) return
  throw forbidden(context)
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalidBody('The request body is not an object.', 'Send a JSON object.')
  }
  return body as Record<string, unknown>
}

function requiredTargetType(body: Record<string, unknown>): RolePermissionTargetType {
  const value = body['targetType']
  if (typeof value !== 'string' || !TARGET_TYPES.includes(value as RolePermissionTargetType)) {
    throw invalidBody(
      'A "targetType" of "collection" or "taxonomy" is required.',
      'Send { "targetType": "collection", "targetName": "…", "action": "…", "roles": [...] }.',
    )
  }
  return value as RolePermissionTargetType
}

function requiredTargetName(body: Record<string, unknown>): string {
  const value = body['targetName']
  if (typeof value !== 'string' || value === '') {
    throw invalidBody(
      'A non-empty "targetName" is required.',
      'Name the exact collection or taxonomy this override applies to.',
    )
  }
  return value
}

function requiredAction(body: Record<string, unknown>): ContentAction {
  const value = body['action']
  if (typeof value !== 'string' || !ACTION_SET.has(value)) {
    throw invalidBody(
      `An "action" is required, one of: ${CONTENT_ACTIONS.join(', ')}.`,
      'Contract A freezes the action vocabulary — pick one of the five.',
    )
  }
  return value as ContentAction
}

function requiredRoles(body: Record<string, unknown>): readonly string[] {
  const value = body['roles']
  if (!Array.isArray(value) || value.some((role) => typeof role !== 'string' || role === '')) {
    throw invalidBody(
      'A "roles" array of non-empty role names is required.',
      'Send [] to grant this action to nobody, explicitly.',
    )
  }
  return value
}

function optionalOwn(body: Record<string, unknown>): boolean | undefined {
  if (!Object.hasOwn(body, 'own')) return undefined
  const value = body['own']
  if (typeof value !== 'boolean') {
    throw invalidBody('"own" must be a boolean when present.', 'Drop it, or send true/false.')
  }
  return value
}

function actionFromSegment(segment: string): ContentAction {
  if (!ACTION_SET.has(segment)) {
    throw invalidBody(
      `"${segment}" is not one of contract A's actions: ${CONTENT_ACTIONS.join(', ')}.`,
      'Check the path against a row GET /api/role-permissions returned.',
    )
  }
  return segment as ContentAction
}

function targetTypeFromSegment(segment: string): RolePermissionTargetType {
  if (!TARGET_TYPES.includes(segment as RolePermissionTargetType)) {
    throw invalidBody(
      '"targetType" in the path must be "collection" or "taxonomy".',
      'DELETE /api/role-permissions/{collection|taxonomy}/{name}/{action}.',
    )
  }
  return segment as RolePermissionTargetType
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
    hint: 'Role permission routes are /api/role-permissions and /api/role-permissions/{collection|taxonomy}/{name}/{action}.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null
  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
}

export function createRolePermissionRouter(
  options: RolePermissionRouterOptions,
): RolePermissionRouter {
  const { store, overlay } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

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
    const segments = segmentsOf(request.path, basePath)
    if (segments === null) throw noRoute()
    const method = request.method.toUpperCase()

    if (segments.length === 0) {
      if (method === 'GET') {
        assertAdmin(context)
        const records = await store.list()
        return jsonResponse(200, { data: records.map(serialise) })
      }
      if (method === 'PUT') {
        assertAdmin(context)
        const body = asRecord(request.body)
        const own = optionalOwn(body)
        const record = await store.set({
          targetType: requiredTargetType(body),
          targetName: requiredTargetName(body),
          action: requiredAction(body),
          roles: requiredRoles(body),
          ...(own === undefined ? {} : { own }),
          updatedBy: context.actor.id,
        })
        await overlay?.refresh()
        return jsonResponse(200, { data: serialise(record) })
      }
      return methodNotAllowed(['GET', 'PUT'])
    }

    if (segments.length === 3) {
      if (method !== 'DELETE') return methodNotAllowed(['DELETE'])
      assertAdmin(context)
      const [rawTargetType, targetName, rawAction] = segments
      const targetType = targetTypeFromSegment(rawTargetType ?? '')
      const action = actionFromSegment(rawAction ?? '')
      if (targetName === undefined || targetName === '') throw noRoute()
      const removed = await store.remove(targetType, targetName, action)
      if (removed) await overlay?.refresh()
      return jsonResponse(200, { data: { removed } })
    }

    throw noRoute()
  }
}
