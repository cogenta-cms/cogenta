---
'@cogenta/fleet': minor
'@cogenta/core': patch
---

`@cogenta/fleet` gains site-side telemetry emission (`packages/fleet/src/agent/`) — the closed, honest shape of what a site is allowed to send to the control plane, per the lot's own "## Ce qui remonte, et ce qui ne remonte pas."

- `TelemetryPayload` is a closed type: only the fields the lot doc names
  (`installedVersions`, `sbomFingerprint`, `openCves`, `coreWebVitalsAggregate`,
  `availability`, `backups`, `certificateExpiry`, `adminAccounts`,
  `aggregatedErrors`) exist on it — no `content`/`media`/`memory`/`logs`
  field is representable at all. `sbomFingerprint`, `openCves`,
  `coreWebVitalsAggregate` and `adminAccounts` are wired to real, existing
  data sources in this codebase (`@cogenta/agents-builtin`'s security/
  performance agents, `@cogenta/auth`'s real user/credential model); the
  rest are honest shape-only placeholders — no real backup mechanism,
  certificate-expiry check, uptime monitor, or error-aggregation sink
  exists anywhere yet, and this task does not fabricate one.
- `assertNoForbiddenFields` is a real, defense-in-depth runtime scan for the
  same forbidden list, catching a leak past a loosely-typed call site that
  TypeScript alone wouldn't stop — the literal "vérification exhaustive de
  ce qui sort d'un site" security test the lot names.
- `signTelemetryPayload`/`verifyTelemetrySignature` reuse `@cogenta/plugins`'
  generalized Ed25519 primitive (task 9/12) — the same one L8 task 1's
  pairing already uses — and refuse to sign a payload carrying a forbidden
  field at all, rather than catching it only closer to the network boundary.
- `fingerprintSbom` hashes the real SBOM via the same canonical, sorted-key
  content-signing helper, with a real bug fixed during this task's own
  testing: `canonicalizeContent` sorts object keys but not array element
  order, so two functionally-identical SBOMs built from a `dependencies`
  record whose keys simply iterate in a different order would otherwise
  fingerprint differently — the entries are now sorted by name before
  canonicalizing.

One new `@cogenta/core` error code: `FLEET_TELEMETRY_FORBIDDEN_FIELD`.
