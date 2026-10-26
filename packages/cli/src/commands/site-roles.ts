import { DEFAULT_COMMERCE_ROLES } from '@cogenta/commerce'
import {
  type CollectionDefinition,
  normalisePermissionRule,
  type RolePermissionStore,
  type TaxonomyDefinition,
} from '@cogenta/schema'

/** The roles every site has, whatever its schema says: what media, settings and the administration check. */
const STANDARD_ROLES = ['admin', 'editor', 'viewer'] as const

/**
 * The role names that mean something on this site — the ones an API key may
 * be scoped to. Before, a key's scope was free text: "superadmin" was
 * accepted, authenticated, and could do nothing, while the screen said the
 * key was created (MCP audit, 2026-10-21).
 *
 * The standard roles, every role a collection or taxonomy names in the
 * schema file, every role an override in the database grants (ADR-0028), and
 * the shop's own roles (contract E). `public` is not one: it is "anyone",
 * which an anonymous request already is.
 */
export async function siteRoleNames(options: {
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly overrides?: Pick<RolePermissionStore, 'list'>
}): Promise<readonly string[]> {
  const names = new Set<string>(STANDARD_ROLES)
  for (const role of Object.keys(DEFAULT_COMMERCE_ROLES)) names.add(role)
  for (const subject of [...options.collections, ...options.taxonomies]) {
    for (const rule of Object.values(subject.permissions ?? {})) {
      for (const role of normalisePermissionRule(rule).roles) names.add(role)
    }
  }
  for (const override of (await options.overrides?.list()) ?? []) {
    for (const role of override.roles) names.add(role)
  }
  names.delete('public')
  return [...names].sort()
}
