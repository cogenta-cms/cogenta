import type { CollectionSummary, ContentAction, TaxonomySummary } from './types.js'
import { normalisePermissionRule } from './types.js'

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
  /**
   * Whether the actor asking is the entry's own author — only ever
   * meaningful when the rule declares `own: true` (`schema@2.1`, ADR-0027).
   * Left out (the default) for a route with no single entry in view: a
   * list, or a "may I create at all" question.
   */
  isOwner = false,
): boolean {
  const rule = normalisePermissionRule(collection.permissions[action])
  if (rule.roles.length === 0) return false
  if (rule.roles.includes(PUBLIC_ROLE)) return !rule.own || isOwner
  if (rule.own && !isOwner) return false
  return roles.some((role) => rule.roles.includes(role))
}

/**
 * The same decision for a taxonomy's terms (`schema@2.0`, ADR-0022).
 *
 * A separate function rather than a widened one, mirroring the split
 * `@cogenta/api`'s `canTerm` makes for a reason that matters there: a site may
 * have a `category` collection and a `category` taxonomy, and the two must
 * never be asked one question.
 */
export function canPerformOnTerms(
  action: ContentAction,
  taxonomy: TaxonomySummary,
  roles: readonly string[],
): boolean {
  const allowedRoles = normalisePermissionRule(taxonomy.permissions[action]).roles
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
