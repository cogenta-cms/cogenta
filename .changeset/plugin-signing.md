---
'@cogenta/core': minor
'@cogenta/plugins': minor
---

Adds L7 task 9: real signature verification for registry-sourced plugins,
per "## Signature" (docs/lots/L7-extensibilite.md): "Une signature invalide
bloque, sans possibilité de passer outre depuis l'interface."

- `packages/plugins/src/signing/` — real Ed25519 signing/verification via
  `node:crypto` (no new dependency): `generateSigningKeyPair`, `signManifest`
  (signs a deterministic, sorted-key canonicalization of the manifest),
  `verifyManifestSignature`/`verifyPluginSignature` (verifies against any
  of a list of trusted public keys), `readSignatureFile` (a signature travels
  as a sibling `<manifest>.sig` file, never embedded in the manifest shape).
- `TRUSTED_REGISTRY_PUBLIC_KEYS` starts empty — no real plugin registry
  exists yet (pre-alpha), so every `registry`-source plugin fails
  verification by default rather than trusting a placeholder key.
- `loadPlugin` (L7 task 2) now calls `resolveSignatureStatus` for every
  resolution: a `registry`-source plugin with a missing or invalid signature
  is hard-refused (`PLUGIN_SIGNATURE_MISSING`/`PLUGIN_SIGNATURE_INVALID`)
  before any plugin code is imported — there is no parameter anywhere that
  lets a caller force past this. A `local`/`git`-source plugin is allowed
  unsigned ("mode développement") and now carries a real `devMode: true`
  flag on `ResolvedPlugin` (plus `signatureVerified: boolean`) for a future
  admin banner to render as the lot's "avertissement permanent."

Two new `@cogenta/core` error codes: `PLUGIN_SIGNATURE_MISSING`,
`PLUGIN_SIGNATURE_INVALID`.
