---
'@cogenta/plugins': minor
---

`@cogenta/plugins` gains the plugins registry (`createPluginRegistry`,
`packages/plugins/src/registries/plugins.ts`), the fourth and last of the
registries named in the lot's own "## Registres" table — and the only one
requiring all three named gates at once: "Signature, manifeste, revue."

- **Signature** — checked first, against the raw, not-yet-validated
  manifest content, reusing task 9/12's generalized Ed25519 primitive
  (`verifyContentAgainstTrustedKeys`) exactly. A missing or untrusted-key
  signature is refused before any structural inspection runs, so an
  attacker without a valid signature can never use manifest-validation
  error messages to probe this registry's rules.
- **Manifeste** — task 1's real `definePlugin`, called unchanged: the same
  four hard refusals (unscoped `http.fetch`, storage outside the plugin's
  own prefix, unknown capability, block without `fallback`) and every
  structural rule apply exactly as they would to a manifest loaded from
  disk. No manifest rule was re-implemented.
- **Revue** — a submission clearing both automatic gates reaches `pending`,
  mirroring the skills registry's (task 11) two-step state machine and its
  exact `{ok:false, reason:'already_decided', entry}` discriminated result
  for a repeated review. Plugins execute code — the one property that
  makes this the only registry with no automatic-only path anywhere in it.
- Registry entries are bookkeeping-only in this pass: an `accepted` entry
  does not automatically become loadable via `loadPlugin`/`runPlugin`.
  No real plugin registry service/HTTP endpoint exists anywhere yet (same
  honest pre-alpha scoping every signing/registry task in this lot has
  kept) — `loadPlugin` resolves from a local path or a package name, not
  from a submitted-content blob, so wiring "accepted → installable" is a
  real, separate integration task for whenever a registry service exists,
  not silently assumed here.
- Persisted via `ensureRegistryTables`, extended a fourth time with the
  identical `create table if not exists` pattern — no new table-creation
  abstraction, per the reasoning already recorded at tasks 10-12.

No new `@cogenta/core` error codes — this registry reuses `PLUGIN_MANIFEST_INVALID` (task 1) and `PLUGIN_SIGNATURE_MISSING`/`PLUGIN_SIGNATURE_INVALID` (task 9) as-is.
