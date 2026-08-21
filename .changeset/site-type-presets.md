---
'create-cogenta': minor
---

L22 task 10 — real site-type presets at installation, not just an empty content blueprint.

- New `store` blueprint (tenth in `BLUEPRINTS`): a `product` collection (name, slug, description, price, category, stock, photo) plus the usual `page` collection, six seeded demo products across three categories, a home page with a live product grid, and a "Shipping & returns" page. Deliberately contract A only — it does not reach into `@cogenta/commerce` (contract E), since that domain has no admin screens or storefront blocks yet (`docs/lots/L10-cms-complet.md` § L15); a product's optional `contentRef` is exactly the seam for wiring the two together later, once `@cogenta/commerce` is.
- `blueprintSettings`'s per-site-type page-cache recommendation and `inferBlueprint`'s brief-matching rules both learn `store` (`boutique`, `e-commerce`, `panier`, `checkout`, …).
- New: a **starting skin per site type**, for `portfolio`, `magazine` and `store` (`./blueprints/starting-skins.ts`) — fixed, hand-picked `SkinTokens` (not AI-generated, so this holds with no LLM provider configured at all, R2), each validated against the same `validateSkin` gate an AI-generated skin has to clear. `scaffoldSite` now writes a blueprint's own starting skin instead of `@cogenta/theme-canonical`'s generic default when no AI skin was generated or approved. `ScaffoldResult.skinSource` gains a third value, `'preset'`, alongside the existing `'generated'`/`'default'` — additive, but a consumer switching exhaustively on that union should account for it.

No change to the LLM-provider question itself (still the site-wide `llm` block in `cogenta.config.mjs`, asked once at install time) — verified it stays the only provider-configuration path this installer offers, so it does not duplicate the admin "Providers" screen a parallel L22 task is adding.
