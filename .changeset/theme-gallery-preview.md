---
"@cogenta/cli": minor
---

Fiche L24 tâche 5 (aperçu visuel des thèmes) — the appearance screen's theme
picker gains a real visual preview per theme, not the five text-only cards it
had since fiche L23.

`@cogenta/cli` gains `renderThemeGalleryPreview` (`theme-render.ts`) and the
new admin-only route `POST /api/theme/gallery-preview`: it renders one fixed,
database-free demo page (hero + collectionList + featureGrid, the same shape
`create-cogenta`'s "blog" blueprint seeds a real home page with) through
whichever installed theme package the request names, and returns the
resulting HTML for the admin to show in an iframe — the same "iframe on the
real server render, never a screenshot or a second React reimplementation of
the twelve blocks" principle the visual page builder (fiche L16) already
established. The route never touches `ContentGateway`: it cannot leak draft
or private content, and it works identically on a site with zero content
seeded yet, which is exactly when an admin is most likely to be comparing
themes.

The demo content is fixed and identical across every theme on purpose —
letting one theme's card look richer than another's because *this site's*
real home page happens to use more blocks would make the comparison
meaningless.

`Site` gains `themeGalleryStyles?: (themeName: string) => Promise<string |
null>`, resolving the combined skin + *that theme's own* stylesheet by name
— distinct from `resolveStyles`/`previewStyles`, which both resolve against
the currently active theme only. Absent under the same condition every other
theme field on `Site` is (no theme wiring — a test harness that does not
care about appearance).

No contract touched: this is server-side rendering wiring, not a change to
contract B, D or the theme registry's resolution rules.
