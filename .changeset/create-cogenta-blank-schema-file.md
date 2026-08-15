---
'create-cogenta': patch
---

Fix `npm create cogenta` with every default answer producing a site that
`cogenta serve` cannot start.

`scaffoldSite` only wrote `cogenta.schema.mjs` when the chosen blueprint had
a real `BlueprintContentPack` — `blank`, the default blueprint
(`DEFAULT_BLUEPRINT_ID`), has none, so no schema file was ever written for
it. `cogenta serve` (`@cogenta/cli`) hard-requires one of
`cogenta.schema.{ts,mts,mjs,js}` to exist next to the config, so the single
most common path — accept every default, then run `cogenta serve` — failed
immediately with `SCHEMA_INVALID`.

The schema file is now written unconditionally: an empty collections array
(`export default []`) for `blank`, a real content pack's collections
otherwise — matching the "Blank — empty schema, nothing pre-configured"
label the installer already shows. `ScaffoldResult.schemaPath` is no longer
optional.

Found and verified end-to-end against a real local npm registry (Verdaccio):
publish every workspace package, install `create-cogenta` purely from that
registry with no access to the monorepo, scaffold a site, and start
`cogenta serve` against it — reproduced the crash on the unfixed code, then
confirmed a real HTTP response (`/api/schema`, `/api/auth/session`) on the
fixed code.
