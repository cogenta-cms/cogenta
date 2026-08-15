---
'@cogenta/core': minor
---

Add `THEME_IMAGE_UNSUPPORTED`, thrown by `cogenta serve`'s new theme-render
fallback (`@cogenta/cli`) when a theme block asks for an image — no image
pipeline is wired into that in-process fallback yet, so a theme gets a clear,
typed refusal rather than a broken `<img>`.
