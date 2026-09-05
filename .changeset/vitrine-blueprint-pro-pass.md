---
"create-cogenta": minor
---

L25 "templates pro" pass on the `vitrine` blueprint: `defaultTheme` is now
`@cogenta/theme-entreprise` (a fresh `vitrine` site activates it with no
admin action), and the home page grows from six blocks to eleven — hero
(procedural flat-geometric backdrop), a five-logo trust strip, a services
`featureGrid` with real icons, a four-figure KPI band, a wide engagement-shot
`mediaFigure`, the full services `collectionList` with cover photos, a
featured `testimonial` with an avatar, a second `quote`, an FAQ, a closing
`cta`, and a short about teaser.

`service` gains `icon` and `coverImage` fields; `testimonial` gains
`avatar`. Six services (was three) and three testimonials (was two) are
seeded, published, with real procedural cover art and avatars via the demo-art
pipeline. A new `contact` page joins `home`/`about`. Header/footer menus,
a `headerAction` ("Get a quote" → `/contact`), a tagline, three social links
and a footer address note are seeded through the real `MenuStore`/site
settings, matching every other L25 blueprint. `vitrine` gains its own
starting skin (`starting-skins.ts`, copied from `theme-entreprise`'s own
default tokens) — the last blueprint with a content pack that had none.

`VITRINE_DEMO_PAGES` is now built from `buildVitrineDemoPages(media,
serviceIdBySlug)`, media- and id-driven like every other L25 blueprint;
`VITRINE_DEMO_PAGES` itself stays exported as `buildVitrineDemoPages({})` for
any caller that does not need real media.
