---
'@cogenta/plugins': minor
---

`@cogenta/plugins` gains a themes registry (`createThemeRegistry`,
`packages/plugins/src/registries/themes.ts`), the third of the four
registries named in the lot's own "## Registres" table: "Signature, contrat
vérifié" — a real, automatic-only two-gate decision, structurally different
from both prior registries (skins: single automatic verdict, no signature;
skills: automatic pre-check then a separate human decision).

- **Signature** — task 9's Ed25519 primitive, generalized: `signManifest`/
  `verifyManifestSignature`/`verifyPluginSignature` are now thin wrappers
  over new generic `signContent`/`verifyContentSignature`/
  `verifyContentAgainstTrustedKeys` functions operating on any canonicalizable
  content, not just a `PluginManifest`. Checked first — an unsigned or
  untrusted-key theme is refused before any contract inspection runs.
- **Contrat vérifié** — reuses `@cogenta/render`'s real, already-built
  contract D install check wholesale: `parseThemeManifest` (manifest
  structure), `verifyTheme` (every vocabulary block declared in
  `implements`, no forbidden import anywhere in the theme's real source
  tree — a submission now carries a real filesystem root, since this check
  scans real files, not inline JSON), and `validateSkin` on the theme's
  default `tokens.json` (same reuse `createSkinGallery`, L7 task 10,
  already established). No new contract logic was written — contract D
  already specified more than just the token schema (manifest shape,
  `implements` coverage, forbidden imports), and all of it was already real
  and tested in `@cogenta/render`, just never reused from `@cogenta/plugins`
  until now.
- Persisted via `ensureRegistryTables` (extended a third time, same
  `create table if not exists` pattern). Final call on the shared
  `Registry<T>` abstraction question (raised, deferred, at each of tasks
  10/11): still not built — with three real, concrete instances now in
  hand, the honest finding is that the three registries' gates are
  genuinely different shapes (single automatic verdict / automatic-precheck
  + human review / signature + contract), so a generic wrapper would either
  leak into passing raw column lists (no real abstraction) or force
  dissimilar state machines into one shape. The real shared primitives
  (`identifier`/`sql`/`createIndexIfMissing`, and now the generalized
  signing functions) already are extracted; the remaining duplication
  (eight-line table declarations) is cheaper than a parameterised builder.

One new `@cogenta/core` error code: `THEME_SIGNATURE_INVALID`.
