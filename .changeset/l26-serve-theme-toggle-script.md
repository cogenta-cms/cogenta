---
'@cogenta/cli': patch
---

`cogenta serve` now emits the shared theme-toggle script once in `<head>`, right after the `color-scheme` meta tag, on every page shell (entry pages, generic pages, the theme gallery preview) — the host's job per contract D, not a theme's.
