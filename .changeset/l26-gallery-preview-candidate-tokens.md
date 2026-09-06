---
'@cogenta/cli': minor
---

`POST /api/theme/gallery-preview` accepts an optional `tokens` field: preview a Theme Creator candidate's own skin against a theme this site is not currently running — the one combination `/api/theme/preview` (locked to the active theme) and the gallery's own default-skin render (locked to each theme's on-disk default) previously had no way to express together. Omitting `tokens` keeps the exact previous behaviour.
