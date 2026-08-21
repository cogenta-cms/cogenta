---
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

L21 task 2 — a runtime template + personalisation system for the admin's
own interface, the counterpart `packages/admin/src/routes/appearance.tsx`
already gave the public site (contract D) but the admin itself never had:
before this, `theme.css` was a single hard-coded design with no selector
and no override mechanism at all.

**`@cogenta/core`:** two new error codes, `ADMIN_THEME_TEMPLATE_UNKNOWN`
and `ADMIN_THEME_INVALID`.

**`@cogenta/schema`:** a new `admin-theme-templates.ts` — two complete,
built-in token sets (`ADMIN_THEME_TEMPLATES`): "Nightops" (the current
dark-first, signal-green console — copied verbatim from `theme.css`) and
"Atelier" (the warm, printed-paper design that shipped immediately before
the Nightops reskin, recovered from git history rather than approximated
from memory) — plus `adminThemeOverridesSchema`, the small, curated set of
personalisation levers a template can be customised with (primary/
background/text colour, display font, body font, corner radius, an
optional logo media id) without ever rewriting the built-in template
itself. `ensureAdminThemeTable`/`createAdminThemeStore` persist exactly one
choice (a template id plus its overrides) in a new fixed table
(`cogenta_admin_theme`, the same one-table-no-migration-file treatment
`menu-tables.ts`/`site-settings-tables.ts` already use for admin-editable,
non-schema-declared state).

**`@cogenta/api`:** `createAdminThemeRouter` — `GET|PUT /api/admin-theme`.
Read needs no session at all (the admin's own `/login` screen has to paint
in the chosen template before one exists); write needs the `admin` role,
checked by the router itself.

**`@cogenta/cli`:** `cogenta serve` mounts the new store and router, and
audits every successful `PUT` the same way `/api/settings` already does.

No breaking changes — a site that never calls `PUT /api/admin-theme` keeps
`theme.css`'s own "Nightops" defaults exactly as before. `@cogenta/admin`
(private, no changeset) gains the settings screen ("Apparence de l'admin",
deliberately a separate nav entry from the public site's own "Apparence"),
`AdminThemeProvider` (injects the computed CSS as a `<style>` tag,
cascading over `theme.css`'s own tokens), and a personalised logo in the
top bar when one is set.
