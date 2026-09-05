---
'@cogenta/cli': patch
---

Registers `@cogenta/theme-blog` in the built-in theme registry (`theme-registry.ts`)
and as a real workspace dependency — selectable from the appearance screen's theme
gallery and by `cogenta_theme.active_theme`, without a restart, exactly like the four
existing built-in themes.
