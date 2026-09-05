---
'create-cogenta': minor
---

Add the `restaurant` blueprint (L25 Phase 1): `menu_item`/`page` collections, twelve
published dishes across four categories (Starters/Mains/Desserts/Drinks) each with a
`photo` field, a rich nine-block home page (hero, story, priced menu, gallery, stats,
testimonial, hours accordion, map embed, closing call to action), header/footer/
header-action menus, a tagline, three social links, a footer note, and its own starting
skin (warm cream/charcoal/copper-wine, matching `@cogenta/theme-restaurant`'s own default
palette). `defaultTheme: '@cogenta/theme-restaurant'` is applied to the scaffolded site
without any action in the admin. Demo visuals are seeded through the real `demo-art`/
media pipeline (L25 task A0b); when no media is seeded (as in a unit test building the
demo blocks directly), the gallery block is left out entirely rather than emitted with an
empty `items` array, which contract B rejects.
