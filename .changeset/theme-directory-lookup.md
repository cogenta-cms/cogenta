---
'@cogenta/cli': minor
---

Fiche 73 task 1 — a theme dropped in `<projectRoot>/themes/<name>/` is now activable,
with no npm package, no dependency added to `@cogenta/cli`, no code change here. Follows
`create-cogenta`'s "site owns its own TypeScript file" precedent (`cogenta.schema.ts`,
already dynamically imported at boot) rather than inventing a new pattern.

`@cogenta/render`'s `loadTheme()` already searched `themes/` in its resolution order —
it was simply never called by `cogenta serve`, only by `cogenta theme install`. This
change wires it in: `resolveTheme(name)` tries the built-in npm-packaged list first
(unchanged, byte for byte), then `<projectRoot>/themes/<name>/` before falling back to
the default theme — the same graceful-fallback behavior an unrecognised or uninstalled
theme name already had (R1/R2: an optional feature never takes a whole site down).
`availableThemes()` (the appearance screen's gallery) lists valid local themes the same
way, alongside the built-in ones.

A local theme's structure is unchanged from what a theme package already exports:
`theme.config.{js,mjs,ts}` for the manifest (contract D, unchanged), and a new required
`theme.render.{js,mjs,ts}` beside it, exporting `renderPage`/`renderChrome` — the exact
shape `ThemeModule` already is. A folder that fails to load or does not export that
shape is silently left out of the gallery, and a stored `activeTheme` naming it falls
back to the default theme, rather than crashing every request; a `themes/` folder never
shadows a real built-in theme package of the same name.

New: `configureThemeRegistry({ projectRoot })`, called once at boot (`runServe`) — the
`themes/` lookup is entirely opt-in and is a no-op for every existing caller that never
calls it (every test, `cogenta skin generate`, and any host embedding `@cogenta/cli`
that has not adopted this yet).

Part of fiche 73 (`docs/plans/73-themes-locaux-bac-a-sable-ia.md`) — a developer can now
write a theme by hand and drop it in `themes/`, with zero involvement from the AI theme
generator. The sandbox, the deploy pipeline with security scanning, AI-driven generation
into that sandbox, and export/import are separate, later tasks of the same fiche.
