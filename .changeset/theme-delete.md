---
'@cogenta/cli': minor
'@cogenta/api': minor
---

**Delete a local theme, for real.** The theme sandbox pipeline (fiche 73)
could deploy, redeploy, version and restore a local theme (`themes/<name>/`)
but never remove one for good — the only way to make one disappear was to
delete the folder by hand outside the CMS entirely.

New `deleteTheme` (`@cogenta/cli`'s `theme-sandbox.ts`) removes both
`themes/<name>/` and its whole `themes/.versions/<name>/` archive — a
genuinely complete removal, not "until someone restores an old version" —
and invalidates the same live-process caches a deploy/restore already does
(`invalidateFilesystemTheme`/`invalidateThemeCss`). Wired as
`DELETE /api/theme/:name` in `cogenta serve` (admin-only, same guard as every
other theme-sandbox route), excluding the pre-existing, reserved
`DELETE /api/theme/overrides` route. If the deleted theme was the site's own
`activeTheme`, the override is cleared too (through the same
`PUT /api/theme/overrides` path the appearance screen's "Sélectionner"
already uses), so the site falls back to the default theme rather than the
stored override staying stuck naming a theme that no longer exists on disk.

`AvailableThemeLike`/`AvailableThemeInfo` (`@cogenta/api`/`@cogenta/cli`)
gain a required `local: boolean` — `true` for a real folder under `themes/`
this project owns and can delete, `false` for an npm-packaged built-in.
Additive on the wire; a client (`@cogenta/admin`, no changeset — private)
uses it to offer "Supprimer" only where deleting is actually possible. The
appearance gallery's own confirmation dialog names the theme, warns
explicitly that the action is irreversible and that the theme's whole
version history disappears with it, and adds a second warning when the
theme being deleted is the one currently running on the public site.
