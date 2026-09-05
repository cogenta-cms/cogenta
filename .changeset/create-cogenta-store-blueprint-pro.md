---
"create-cogenta": minor
---

The `store` blueprint (L25, "templates pro" passe pro on
`@cogenta/theme-ecommerce`) is now a real, pro-looking storefront rather
than a six-product sampler: its starting skin now matches
`@cogenta/theme-ecommerce`'s own default (`tokens.json`) — a magenta
accent, Archivo/Fraunces — rather than the earlier placeholder teal that
never matched what the theme actually ships. The catalogue grows to twelve
products across four categories (Apparel, Home, Accessories, Outdoor),
three of them `inStock: false` so the new out-of-stock badge has something
real to show.

The home page grows to the ten-block composition the brief asks for: hero
→ category tiles (a `gallery`, each tile's picture captioned by its own
category name) → "New arrivals" grid → a promo band → a "Why buy from us"
feature grid (real icons: `truck`, `refresh`, `shield`, `credit-card`) → a
"Best sellers" grid (a different cut of the same catalogue) → a testimonial
with an avatar → a trust-badge strip → an FAQ → a newsletter call to
action. Four new pages join `home`/`shop`: `new` (a dedicated arrivals
page), `categories` (one real filtered grid per category, via
`collectionList.filter`), `about`, and `legal` — `shipping-returns` is
renamed `help` to match the footer nav the brief asks for
(`Shop`/`Help`/`Legal`). Header nav becomes `Shop`/`New`/`Categories`/`About`,
with `Shop now` as the header action. A third social link (Pinterest) joins
Instagram and X. All seeded through the real content store and the real
procedural-media pipeline (`seedDemoMedia`, 23 images total), never mocked.
