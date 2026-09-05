---
'@cogenta/cli': patch
---

Register `@cogenta/theme-restaurant` in `theme-registry.ts`'s `BUILTIN_THEMES` and as a
declared dependency, so it is selectable from the admin's appearance screen alongside the
other built-in themes, with no change to any existing site's active rendering.
