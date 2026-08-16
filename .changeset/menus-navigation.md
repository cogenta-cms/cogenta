---
"@cogenta/schema": minor
"@cogenta/api": minor
"@cogenta/cli": minor
---

Navigation menus, missing entirely until now — no backend, no admin, no theme wiring — and
a P0 gap for a CMS meant to compete with WordPress/Strapi/Drupal.

`@cogenta/schema` gains `createMenuStore`/`ensureMenuTables`: a menu is a named tree of
items (`entry` — a link to a real collection entry, `url` — an external link, or
`submenu-placeholder` — a heading with no target of its own), structurally close to a
taxonomy term tree (materialised path, reusing `taxonomy-path.ts`'s helpers as-is) but
**not** a `TaxonomyStore`: a menu is created and edited entirely at runtime from the admin,
never declared in a site's schema module, so it gets one fixed pair of tables
(`cogenta_menus`/`cogenta_menu_items`) rather than one table per declared name. A menu
belongs to a locale the same way a localised collection does (ADR-0014) — two menus named
`main` can coexist, one per locale, never one row trying to carry both. New error codes:
`MENU_UNKNOWN`, `MENU_NAME_TAKEN`, `MENU_ITEM_NOT_FOUND`, `MENU_ITEM_INVALID`,
`MENU_CYCLE`.

**One real bug found and fixed while building this**: a materialised path is id-based, so
two siblings' paths diverge at their own id — sorting a listing by `path asc, position asc`
(`taxonomy-store.ts`'s own pattern) therefore sorts siblings by *creation order*, never by
`position`, silently defeating any "move up/down" a caller might build on top of it. The
menu store walks the tree in application code instead (group by parent, sort each group by
`position`, depth-first from the roots) — cheap for something the size of a navigation
menu, and it is what makes `reorderItem` (swap with the sibling before/after) actually work.

`@cogenta/api` gains `createMenuRouter`: `GET /api/menus` and `GET /api/menus/{id}` are
public (a menu serves the public theme's navigation, same as a published entry); every
write requires `admin` or `editor` — a fixed rule, not a per-site permission
configuration, since a menu is neither a collection nor a taxonomy and giving it a third
`PermissionLayer` method for one rule that never varies would be new surface for nothing.
`GET /api/menus/by-name/{name}?locale=` resolves a menu the way a theme will want to
(refusing ambiguity across locales without `?locale=`, rather than guessing). An `entry`
item is optionally resolved to a display label and public route via an injected
`resolveEntry` callback, kept out of the router itself so it stays decoupled from content
resolution.

`cogenta serve` mounts `/api/menus/*`, resolving `entry` items through the same
permission-checked `ContentGateway` and `buildPath` the theme renderer uses, as `ANONYMOUS`
(a menu is public navigation — an item never resolves to more than an anonymous visitor
could see). The admin gains a `/menus` screen (menu selector, item list with up/down
reorder buttons and delete, add-item form for a URL or a collection+entry), kept plain like
`taxonomies.tsx` — L11 owns how the admin looks; every action goes through the real API and
write controls only render for `admin`/`editor` (the server refuses the rest regardless,
R4).

**What is not done, and why**: theme rendering (a public page actually showing a menu) is
out of scope for this change — see `BLOCKERS.md` for the exact point to wire it in
(`packages/theme-canonical/src/Base.astro`'s header/footer slots, fed by
`GET /api/menus/by-name/{name}`). Nothing here touches contract A or B: a menu is
deliberately not content and not a block.
