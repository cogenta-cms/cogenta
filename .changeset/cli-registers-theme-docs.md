---
'@cogenta/cli': patch
---

L25 Phase 1 — registers the new `@cogenta/theme-docs` package in the built-in theme
registry (`theme-registry.ts`) and as a real npm dependency, so a site can select it from
the Appearance screen and `cogenta serve`/`cogenta dev` can actually load it.
