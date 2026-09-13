---
'@cogenta/cli': patch
---

**Theme typefaces finally load.** `cogenta serve` joins the skin's custom
properties and the active theme's stylesheet into one sheet, skin first — which
put every theme's Google Fonts `@import` after a rule, where CSS silently
ignores it. No theme had ever rendered in its own typeface: Fraunces, Inter
Tight, Cormorant and the rest all fell back to the system font. Remote
`@import` statements are now hoisted to the top of the joined sheet.
