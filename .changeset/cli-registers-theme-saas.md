---
"@cogenta/cli": patch
---

Registers `@cogenta/theme-saas` (L25) in the built-in theme registry
(`theme-registry.ts`'s `BUILTIN_THEMES`) and adds it as a real dependency, so
a site can select it from the Appearance screen and `saas`-blueprint sites
activate it by default.
