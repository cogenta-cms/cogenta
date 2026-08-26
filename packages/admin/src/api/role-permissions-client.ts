import { authHeader, request } from './http.js'

/**
 * `/api/role-permissions` — fiche 63, ADR-0028: a role's grant on a
 * collection or taxonomy action, overridable in the database and applied
 * without a deploy cycle. Admin-only on the server; this client mirrors that
 * without re-checking it (R4 stays server-side).
 */

export type RolePermissionTargetType = 'collection' | 'taxonomy'

export type RolePermissionContentAction = 'read' | 'create' | 'update' | 'delete' | 'publish'

export interface RolePermissionOverride {
  readonly targetType: RolePermissionTargetType
  readonly targetName: string
  readonly action: RolePermissionContentAction
  readonly roles: readonly string[]
  readonly own: boolean
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export function listRolePermissionOverrides(
  token: string,
): Promise<readonly RolePermissionOverride[]> {
  return request('/api/role-permissions', { headers: authHeader(token) })
}

export interface SetRolePermissionOverrideInput {
  readonly targetType: RolePermissionTargetType
  readonly targetName: string
  readonly action: RolePermissionContentAction
  readonly roles: readonly string[]
  readonly own?: boolean
}

export function setRolePermissionOverride(
  token: string,
  input: SetRolePermissionOverrideInput,
): Promise<RolePermissionOverride> {
  return request('/api/role-permissions', {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function removeRolePermissionOverride(
  token: string,
  targetType: RolePermissionTargetType,
  targetName: string,
  action: RolePermissionContentAction,
): Promise<boolean> {
  const result = await request<{ readonly removed: boolean }>(
    `/api/role-permissions/${encodeURIComponent(targetType)}/${encodeURIComponent(targetName)}/${encodeURIComponent(action)}`,
    { method: 'DELETE', headers: authHeader(token) },
  )
  return result.removed
}
