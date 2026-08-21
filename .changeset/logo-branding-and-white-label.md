---
'@cogenta/schema': patch
'@cogenta/cli': patch
'@cogenta/theme-canonical': patch
---

Fiche L21 task 8 — Cogenta's own logo and credit, and a white-label override.

Nothing branding-related existed before this: the admin's topbar carried a
plain `//` text mark, and the public footer showed only the site's own name
and its footer nav. `@cogenta/schema`'s `SITE_SETTINGS_REGISTRY` gains a new
`branding` group — `branding.showCogentaBranding` (boolean, `true` by
default) and `branding.customLogoMediaId` (a media id, or unset) — persisted
through the same generic key/value settings table every other editorial
setting already uses, so no migration was needed for it.

`@cogenta/cli`'s public theme render (`theme-render.ts`, both `renderPageChrome`
and `renderEntryPage`) now renders a small branding block in the site
footer: Cogenta's own logo and a link back to the project by default, the
site's uploaded replacement once Cogenta's credit is turned off (served
through the same public `/_image` endpoint every other image on the page
already uses), or nothing once it's off with no replacement. Cogenta's own
logo is served at a new, permanently cacheable `/_cogenta/logo-cogenta.png`
route — a 64×64 PNG resized from the vendored source with the project's own
WASM image driver (zero new dependency, R9/R10), the same degraded-tier
codec `/_image` already relies on. Read live per request off the same
settings store `reading.homePath` already reads, so turning branding off
shows up on the very next page view, not the next restart — verified end to
end (`test/serve-branding.test.ts`) on the home page, `/search`, and the
page builder's own preview (whose fidelity test asserts its `<body>` stays
byte-identical to the published page's — the branding block had to be wired
identically on both paths for that to still hold).

`@cogenta/theme-canonical`'s `base.css` gains the `.cg-site-footer__branding`
rules the new markup needs.
