import type { PluginManifest } from '../manifest.js'
import type { PluginGrant } from './grants.js'

/**
 * "Traduction capacités → objet SDK, avec absence des méthodes non
 * accordées" (docs/lots/L7-extensibilite.md, task 5) — the real reconciliation
 * between what a manifest DECLARES (task 1) and what has actually been
 * APPROVED (`./grants.js`). The result is the INTERSECTION of the two, by
 * exact capability string:
 *
 *   - A grant for a capability the current manifest no longer declares is
 *     excluded (a stale grant left over from an old manifest version never
 *     leaks through).
 *   - A declared-but-never-granted capability is excluded (nothing is
 *     granted just because a plugin asked for it).
 *   - `http.fetch:api.exemple.com` being granted does NOT cover
 *     `http.fetch:evil.com` even though both share the bare name
 *     `http.fetch` — grants are exact-string, never prefix- or
 *     name-matched.
 *
 * This is the ONLY list that may ever reach `buildSdk`
 * (`../guest/sandbox-entry.mjs` via `runIsolated`'s `grantedCapabilities`
 * option) — never the manifest's raw `capabilities` array, and never a
 * caller-supplied list task 4 originally accepted as a placeholder.
 */
export function resolveGrantedCapabilities(
  manifest: PluginManifest,
  grants: readonly PluginGrant[],
): readonly string[] {
  const grantedSet = new Set(
    grants.filter((grant) => grant.pluginName === manifest.name).map((grant) => grant.capability),
  )
  return manifest.capabilities.filter((capability) => grantedSet.has(capability))
}

/**
 * "## Les mises à jour de plugins" (docs/lots/L7-extensibilite.md, lines
 * 192-193, quoted in full): "Une nouvelle version demandant plus de
 * permissions ne doit **jamais** s'installer automatiquement. Nouvelle
 * approbation exigée."
 *
 * Chosen operational semantics: the new manifest version MAY be resolved and
 * run immediately (it is not blocked from activating) — but
 * `resolveGrantedCapabilities` above already, structurally, excludes any
 * capability the grant store has no exact-string row for. A capability the
 * new manifest declares for the first time therefore has no matching grant
 * yet and is silently absent from the SDK (task 4's "absent, not refused"
 * property) until someone calls `PluginGrantStore.grant` for it — there is
 * no separate "block activation" state machine to build, because the
 * reconciliation function itself already never auto-grants. This function
 * exists to make that property VISIBLE and TESTABLE as its own concern (a
 * permission screen, task 7, needs exactly this list to prompt the user for
 * fresh approval), not to add a second enforcement mechanism alongside
 * `resolveGrantedCapabilities`.
 */
export function detectCapabilitiesNeedingApproval(
  newManifest: PluginManifest,
  previouslyGrantedCapabilities: readonly string[],
): readonly string[] {
  const previouslyGranted = new Set(previouslyGrantedCapabilities)
  return newManifest.capabilities.filter((capability) => !previouslyGranted.has(capability))
}
