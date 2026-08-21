---
"@cogenta/core": patch
"@cogenta/schema": minor
"@cogenta/api": minor
"@cogenta/cli": minor
"@cogenta/theme-canonical": patch
---

Fiche 22 tâche 8 (finitions d'admin) — several small, independently useful
changes across the published packages:

`@cogenta/core`'s `package.json` now declares `"./package.json"` in its
`exports` map, so a dependent (`@cogenta/cli`) can resolve its own real
installed version through Node's standard ESM resolution instead of a
hand-maintained copy. Purely additive; nothing else in the package changes.

`@cogenta/schema`'s `SITE_SETTINGS_REGISTRY` gains a `navigation` group and
four new keys (`navigation.sectionOrder`, `navigation.hiddenSections`,
`navigation.itemOrder`, `navigation.hiddenItems`) — site-wide admin sidebar
reordering and hiding (e.g. "hide the Commerce section on a portfolio
site"), stored the same comma-separated-list way `content.
newEntryDefaultBlocks` already is. Additive to the registry; no existing key
changes shape or default.

`@cogenta/api`'s `ShellStatus` (and `createShellStatusRouter`'s
`ShellStatusRouterOptions`) gains `cogentaVersion: string` — the installed
`@cogenta/core` version, answered to every actor including an anonymous
one (never secret), consumed by the admin footer/topbar. A caller that does
not pass `cogentaVersion` gets `'0.0.0'` rather than `undefined`.

`@cogenta/cli` gains `getCogentaVersion()` (`commands/cogenta-version.ts`),
resolving `@cogenta/core`'s own `package.json` version through
`import.meta.resolve` and caching it. `cogenta serve` now threads this
version into `GET /api/shell-status` and, when Cogenta's own branding stays
on, into the public site footer next to its existing credit — extending
`ThemeRenderOptions`'s `BrandingSettings` with an optional `cogentaVersion`
field, never duplicating the branding on/off logic itself.

`@cogenta/theme-canonical`'s `base.css` gains a small `.cg-site-footer__version`
rule for the version text above, and a `gap` on `.cg-site-footer__branding a`
so the logo and the version sit apart cleanly — no structural change to the
footer markup beyond the one optional `<span>`.
