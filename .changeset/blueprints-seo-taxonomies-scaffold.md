---
"create-cogenta": minor
---

Audit fiche 06/04/15 (2026-09-01), corrections A3 — three real gaps in every
blueprint a scaffolded site ships with:

**SEO fields, on every routed collection of every blueprint.** The admin's
SEO panel (`seo-panel.tsx`) and `@cogenta/seo`'s rendering have always read
`seoTitle`/`seoDescription`/`seoImage`/`seoNoindex` by naming convention —
but no blueprint declared them, so the panel rendered nothing for any entry
of any blueprinted site. All nine real blueprints (`blog`, `magazine`,
`portfolio`, `vitrine`, `documentation`, `association`, `restaurant`,
`saas`, `store`) now declare the four fields on their routed collection(s),
via a new shared `SEO_FIELDS` export (`blueprints/content-pack.ts`) spread
into each collection's `fields`. `seoCanonical` is deliberately not
included — rarely useful for a brand-new site, left as a field an editor
adds by hand if they ever need it.

**`blog`'s `category`/`tag` are now real taxonomies, not collections.**
`schema@2.0` (ADR-0022) already froze `defineTaxonomy()`/`f.taxonomy()` for
exactly this shape — classification with no status, no version, no
lifecycle of its own — and the `blog` blueprint, the one every quick-start
path reaches for, never adopted it. `post.category`/`post.tags` are now
`f.taxonomy()` fields, `category`/`tag` are `defineTaxonomy()` declarations
seeded through the real `TaxonomyStore`, and the scaffolded
`cogenta.schema.mjs` now carries a `taxonomies` named export alongside its
default collections export (`BlueprintContentPack` gains an optional
`taxonomies` field, `scaffoldSite`/`resetPlaygroundData` both wire it
through `createSchemaTables`/`dropSchemaTables`). A scaffolded blog's
Taxonomies admin screen is now populated from the first run, with no manual
step. **Behaviour change**: `category` no longer has its own route
(`/blog/category/:slug` is gone) — a taxonomy declares no `routing`, unlike
the collection it replaces; a themed term-archive page is not part of this
fix.

**`package.json` gains `scripts.start` (`cogenta serve`) and
`engines.node` (`>=22.13`)**, matching the version `cogenta doctor` and the
installer itself already require — `npm start` and most PaaS
auto-detection now work on a scaffolded site without a manual step.

No contract change: `f.taxonomy()`/`defineTaxonomy()` were already part of
the frozen `schema@2.0` contract (ADR-0022); this is a blueprint choosing
to use them, not a new capability.
