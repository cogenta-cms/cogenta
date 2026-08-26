---
'@cogenta/cli': minor
---

`ThemeRenderOptions` gains an optional `blocks` field (a `BlockRegistry`), threaded
through to `theme.renderPage`/`ThemeModule.renderPage`'s new optional fourth parameter
(fiche 43, sous-chantier C(ii)). Lets a site with blocks of its own pass its registry so
an active theme that does not implement one of them renders its declared `fallback`
instead of a blank slot. Absent by default — no site declares custom blocks today, so
this is forward wiring with no behaviour change for an existing `cogenta serve`.
