import type { CollectionSummary, ContentAction } from './types.js'

/** Every actor holds this — a collection readable by `public` is readable by everyone. */
const PUBLIC_ROLE = 'public'

/**
 * The same decision `@cogenta/api`'s `PermissionLayer.can()` makes: allowed
 * only if one of the roles this collection grants the action to is held by
 * the actor (or the action is open to `public`).
 *
 * Kept as its own tiny, independently-tested function rather than imported
 * from `@cogenta/api` — that package pulls in the database and GraphQL
 * layers, none of which belong in this bundle (the same reasoning
 * `src/main.tsx` already applies to `@cogenta/core`). Two implementations of
 * one decision is normally a risk of drift, but here a drift is not a
 * silent leak: the API is still the one thing that actually enforces this,
 * so a UI that shows an action the API refuses is a bug you see immediately,
 * not one that lets anything through.
 */
export function canPerform(
  action: ContentAction,
  collection: CollectionSummary,
  roles: readonly string[],
): boolean {
  const allowedRoles = collection.permissions[action] ?? []
  if (allowedRoles.length === 0) return false
  if (allowedRoles.includes(PUBLIC_ROLE)) return true
  return roles.some((role) => allowedRoles.includes(role))
}

/** Collections this actor may at least read — what a collection list should show at all. */
export function readableCollections(
  collections: readonly CollectionSummary[],
  roles: readonly string[],
): readonly CollectionSummary[] {
  return collections.filter((collection) => canPerform('read', collection, roles))
}
