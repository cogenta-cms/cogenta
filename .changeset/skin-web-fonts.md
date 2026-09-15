---
"@cogenta/render": minor
"@cogenta/cli": patch
"@cogenta/agents": patch
---

A typeface a skin names now loads. `@cogenta/render` gains `WEB_FONTS`, a closed catalogue of Google Fonts families whose `css2` requests were each verified, and `renderSkinCss` opens with an `@import` for every catalogue family a skin's `font.sans`/`font.serif`/`font.mono` stacks lead with. `cogenta serve` drops such an import when the theme already loads the same family. The skin generator is told which families load, so a personalisation no longer falls back to Georgia or Times.
