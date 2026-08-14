---
'@cogenta/schema': patch
---

Fixes a silent export collision: two unrelated types were both named
`ContentBlock` in `@cogenta/schema`'s public surface — the store's
`key`/`type`/`data` row shape (`store/types.ts`, backing `BlockZones` and
`ContentEntry`), and the raw `_key`/`_type` wire-validation shape a `blocks`
field write is checked against (`validation.ts`). Because an explicit named
export wins over an `export *` re-exporting the same name, the validation
shape silently shadowed the store shape — any consumer importing
`ContentBlock` got the wire shape, with no way to reach the store shape
under that name at all.

The validation shape is renamed `RawBlockInput`. `ContentBlock` now
unambiguously refers to the store's row shape, matching what `BlockZones`
and `ContentEntry` already exposed. No wire or storage shape changed — this
is a TypeScript type-alias rename only, and no consumer in this workspace
was importing the shadowed name (`packages/admin`, `packages/render` and
`packages/import` each already used their own local, structurally
equivalent type rather than this ambiguous export).
