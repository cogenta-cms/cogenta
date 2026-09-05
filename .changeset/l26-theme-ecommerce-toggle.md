---
'@cogenta/theme-ecommerce': minor
---

Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header, after the primary nav, inside the same header bar — it survives the CSS-only mobile collapse without needing an entry in `hasMenu`. Styled as `.cg-theme-toggle` in this theme's own magenta-accented register.
