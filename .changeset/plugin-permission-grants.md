---
'@cogenta/plugins': minor
---

L7 task 5: "Traduction capacités → objet SDK, avec absence des méthodes non
accordées" — the real permission-grant data layer task 4's `buildSdk` was
missing, and the mechanism that makes plugin updates safe.

`PluginGrantStore` (`packages/plugins/src/permissions/grants.ts`) persists
per-`(pluginName, exactCapabilityString)` approvals — `http.fetch:api.exemple.com`
being granted never implicitly covers `http.fetch:evil.com`, even though
both share the bare name `http.fetch`, because grants are keyed to the exact
string, not the bare capability name.

`resolveGrantedCapabilities(manifest, grants)` is the real translation the
task title names: the intersection of what a manifest currently declares and
what has actually been approved. A stale grant for a capability the current
manifest no longer declares never leaks through; a declared-but-unapproved
capability is never included.

"Une nouvelle version demandant plus de permissions ne doit jamais
s'installer automatiquement" (a named pitfall) falls out of that
intersection by construction — a newly-declared capability has no matching
grant row yet, so it is silently absent from the resolved list (and
therefore from the SDK, per task 4's "absent, not refused" property) until
someone calls `grant()` for it. `detectCapabilitiesNeedingApproval` makes
that "needs fresh approval" set an explicit, testable value a future
permission screen (task 7) can read.

`runPlugin(manifest, code, grants, options)` is the new real entry point in
`packages/plugins/src/host/worker-runner.ts` — it computes
`grantedCapabilities` itself via `resolveGrantedCapabilities` rather than
accepting an externally-decided list, closing the placeholder task 4 left
open.
