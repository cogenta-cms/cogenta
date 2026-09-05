---
'@cogenta/theme-blog': minor
---

Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header, after both the desktop and mobile nav. Fix a real layout bug found while verifying it: `.cg-prose` (the reading column every article and static page uses) never cleared a preceding floated `mediaFigure` (e.g. an "About" page's aligned author photo), so the auto-centered column could wrap unpredictably beside the float instead of starting clear below it.
