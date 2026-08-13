import type { CollectionDefinition } from '@cogenta/schema'

/**
 * Whether a role must clear a second factor before it can act.
 *
 * The spec names `content.publish` and `site.config_write` — contract C's
 * permission taxonomy, for an agent tool. L2 has no tool permissions yet; the
 * faithful reading for a **collection**-scoped role (contract A) is the
 * closest equivalent action: a role that can `publish` on any collection, and
 * the `admin` role always, since site configuration has no dedicated model in
 * L2 and `admin` is where that power concentrates until it does.
 *
 * This is not configurable per site, on purpose — the spec says "non
 * contournable par configuration", and a setting that can be turned off is a
 * setting that will be, by whoever is in the biggest hurry the day it matters.
 */
const ALWAYS_SENSITIVE_ROLES = new Set(['admin'])

export function sensitiveRoles(collections: readonly CollectionDefinition[]): ReadonlySet<string> {
  const roles = new Set(ALWAYS_SENSITIVE_ROLES)
  for (const collection of collections) {
    for (const role of collection.permissions.publish ?? []) roles.add(role)
  }
  return roles
}

export function requiresMfa(
  userRoles: readonly string[],
  collections: readonly CollectionDefinition[],
): boolean {
  const sensitive = sensitiveRoles(collections)
  return userRoles.some((role) => sensitive.has(role))
}
