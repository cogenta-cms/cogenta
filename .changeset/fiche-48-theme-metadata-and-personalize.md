---
'@cogenta/render': minor
'@cogenta/theme-canonical': patch
'@cogenta/theme-ecommerce': patch
'@cogenta/theme-entreprise': patch
'@cogenta/theme-magazine': patch
'@cogenta/theme-portfolio': patch
'@cogenta/api': minor
'@cogenta/cli': minor
---

Theme manifest gains `description`/`author` (`theme@1.2`, additive), and the
"Apparence" admin screen splits into a theme gallery and a "Personnaliser"
screen reached from it (fiche 48).

- `@cogenta/render`'s `ThemeManifest` gains optional `description?: string`
  and `author?: string` (`theme@1.2`). Both are optional so a manifest
  written before this version, or a third-party theme that simply omits
  them, keeps validating unchanged — the appearance gallery falls back to
  the registry's own `label` when `description` is absent, and shows no
  author line at all when `author` is absent.
- The five built-in themes (`@cogenta/theme-canonical`, `-ecommerce`,
  `-entreprise`, `-magazine`, `-portfolio`) now declare `description` and
  `author: 'Cogenta'` in `theme.config.ts`. Patch releases: no rendering
  behaviour changed, only manifest metadata.
- `@cogenta/api`'s `AvailableThemeLike` (and `GET /api/theme`'s
  `availableThemes`) gains `version: string` and `author: string | null`,
  read straight from each theme's manifest rather than duplicated by hand —
  editing a theme's `theme.config.ts` alone now changes what the API
  returns.
- `@cogenta/cli`'s `theme-registry.ts` `availableThemes()` becomes
  **async** (breaking for any direct caller — it now has to load and cache
  each theme's manifest, which is an ESM dynamic import): it reads
  `label` from the registry as before, but now reads `description`,
  `version` and `author` from the theme's own manifest instead of a
  hand-duplicated string. Both call sites in `cogenta serve` were updated
  to `await` it.
- The admin's "Apparence" screen (`packages/admin`, unpublished) is split
  into two screens: a gallery (theme preview, name, description, version,
  author, and a "Personnaliser" action on whichever theme is active) and a
  personalization screen (tokens, contrast warnings, additional CSS,
  identity, skin gallery, AI generation) — previously one dense, continuous
  screen. Purely a navigation change: every existing action still does
  exactly what it did before, just behind one more click.
