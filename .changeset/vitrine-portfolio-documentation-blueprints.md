---
'create-cogenta': minor
---

`create-cogenta` — three more blueprints (L9 task 8, batch A of two):

- **`vitrine`**: a one-pager business showcase. `service` (routed at
  `/services/:slug`, so a `collectionList` block can safely link to each
  one) and `testimonial` collections; `home` (hero + live services grid +
  cta) and `about` (prose + two `quote` blocks mirroring the seeded
  testimonials — a testimonial has no page of its own worth linking to, so
  it is not queried live like `service`).
- **`portfolio`**: `project`, routed at `/work/:slug`; `home` (hero + a live
  project grid) and `about` (prose + a static `stats` block).
- **`documentation`**: `doc_page` (title/section/order/body, routed at
  `/docs/:slug`) is the "pages types" for this blueprint directly, plus one
  `page` entry (`home`) linking into a live list of doc pages — the most
  different of the three in spirit: reference material, not marketing.

All three reuse the `BlueprintContentPack` extension point introduced
alongside them (previous commit) and a new shared `definePageCollection`
helper (`content-pack.ts`) for the `title`/`slug`/`blocks` shape `blog`'s
own `page` collection already had — the third and later real usages of
that exact shape, per AGENTS.md's "not before three real usages"; `blog.ts`
itself is left untouched.

`resolveBlueprint` now resolves `vitrine`, `portfolio` and `documentation`
as available. Four blueprints remain for a second batch: magazine,
association, restaurant, SaaS.
