---
'@cogenta/render': minor
'@cogenta/plugins': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/core': minor
'@cogenta/cli': minor
---

Add the "Apparence" admin screen (fiche 14) — the CMS's most-differentiating
feature, AI skin generation, was previously exposed only through the CLI.

- `@cogenta/render` gains `mergeSkinTokens` (`SkinTokenOverrides`): overlays a
  partial token tree onto a complete base skin, group by group, key by key.
- `@cogenta/schema` gains `createThemeStore`/`ensureThemeTable` — one row of
  theme overrides (a partial token overlay, additional CSS, and four identity
  media references), the database half of the two-source-of-truth design
  task 0 settles on: `theme.tokens.json` stays the versioned file default,
  the database holds what an `admin` changed from the admin screen.
- `@cogenta/plugins`'s `SkinGalleryEntry` now carries the accepted skin's real
  `tokens` (`null` for a rejected entry) — needed to render a swatch or apply
  a gallery skin, previously only metadata.
- `@cogenta/api` gains `createThemeRouter` (`GET/PUT/DELETE /api/theme[/overrides]`,
  `GET /api/theme/skins`, `POST /api/theme/skins/:id/apply`,
  `POST /api/theme/generate`, `POST /api/theme/export`), plus the
  `SKIN_*`/`THEME_*` error-code → HTTP-status mappings it needs.
- `@cogenta/cli` wires it all into `cogenta serve`/`dev`: `resolveStyles()`
  recomputes the served stylesheet on every request (file tokens merged with
  saved overrides plus additional CSS), which is what makes a saved change
  visible on the very next page view instead of only after a restart — the
  "hot swap" contract D already promised for the file alone. A new
  `POST /api/theme/preview` route renders the real home page with a candidate
  overlay nobody has saved yet, the same iframe-on-the-real-render decision
  L16 made for the page builder. Exporting the merged tokens back into
  `theme.tokens.json` is gated to `cogenta dev` only, mirroring the
  ADR-0010 rule L19's site-plan applier already uses for the schema file.

R2 verified: without an LLM provider, `GET /api/theme` reports
`aiAvailable: false` and the admin's AI section does not render at all — no
error, no dead link. R6 verified: an AI-generated candidate or a chosen
gallery skin is never applied automatically; a save is always a separate,
explicit action.
