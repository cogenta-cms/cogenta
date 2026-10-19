---
'@cogenta/render': minor
---

A skin sheet no longer `@import`s Google Fonts unless asked to. **Behaviour change.**

`renderSkinCss`/`renderSkin`/`createSkinStore` used to put an `@import` to
`fonts.googleapis.com` at the top of every sheet whose font stacks led with a catalogue
family, which sent every visitor's address to Google before any consent. They now emit
none by default. The new `remoteWebFonts: true` option restores the imports, for the
catalogue families that are not bundled with the built-in themes.

`webFontImports(font, { remote })` takes the same switch (default off). New exports:
`SELF_HOSTED_FAMILIES` (the catalogue families the built-in themes ship as WOFF2 files),
`isSelfHostedFamily` and `availableWebFonts(remote)` — the families a skin can rely on
loading, which is what a skin generator should offer a model.
