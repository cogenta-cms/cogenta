import { type CollectionDefinition, normalisePermissionRule } from '@cogenta/schema'

/**
 * Which roles are sensitive enough that a second factor is *recommended*.
 *
 * The spec names `content.publish` and `site.config_write` — contract C's
 * permission taxonomy, for an agent tool. L2 has no tool permissions yet; the
 * faithful reading for a **collection**-scoped role (contract A) is the
 * closest equivalent action: a role that can `publish` on any collection, and
 * the `admin` role always, since site configuration has no dedicated model in
 * L2 and `admin` is where that power concentrates until it does.
 *
 * ADR-0021 changed what this answer is *for*. It used to decide who was turned
 * away at sign-in until they enrolled a second factor — which meant the very
 * first admin of a brand-new site had to complete a TOTP ceremony before they
 * could see a single screen, and an admin without a phone to hand could not get
 * in at all. It now decides who *receives the recommendation* to turn MFA on
 * (`@cogenta/api`'s notices), which is persistent and impossible to lose track
 * of, but never blocks. Enrolment is still real and still enforced at sign-in
 * once it exists — see `passwordLogin` in `login.ts`.
 *
 * Still not configurable per site, for the reason it never was: a setting that
 * can be turned off is a setting that will be, by whoever is in the biggest
 * hurry the day it matters.
 */
const ALWAYS_SENSITIVE_ROLES = new Set(['admin'])

export function sensitiveRoles(collections: readonly CollectionDefinition[]): ReadonlySet<string> {
  const roles = new Set(ALWAYS_SENSITIVE_ROLES)
  for (const collection of collections) {
    for (const role of normalisePermissionRule(collection.permissions.publish).roles) {
      roles.add(role)
    }
  }
  return roles
}

/** Whether this set of roles is one MFA is recommended for. Never a gate — see above. */
export function requiresMfa(
  userRoles: readonly string[],
  collections: readonly CollectionDefinition[],
): boolean {
  const sensitive = sensitiveRoles(collections)
  return userRoles.some((role) => sensitive.has(role))
}
