---
'@cogenta/cli': patch
---

A page links the theme stylesheet at an address carrying the sheet's own digest (`/_cogenta/styles.css?v=…`), as the plugin stylesheets already are, and the server keeps that address a year (`immutable`). Every other address, with no digest or an older one, is still revalidated and still serves the current sheet, so a skin or theme change shows on the next page. The render-blocking sheet no longer costs a revalidation round trip on each navigation. The page builder preview now links the live sheet like the published page, not the startup snapshot.
