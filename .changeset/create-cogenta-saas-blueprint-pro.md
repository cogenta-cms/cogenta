---
"create-cogenta": minor
---

The `saas` blueprint (L25, "templates pro") is now a real, pro-looking
starting point rather than a bare features list: it activates
`@cogenta/theme-saas` by default, ships that theme's own violet-blue
starting skin (`STARTING_SKINS.saas`), and seeds a ten-block home page (hero
with a mesh-gradient backdrop, a trust-logo strip, a six-item feature grid,
a product shot, usage stats, a testimonial, a second quote, a three-tier
pricing table, an FAQ, and a closing call to action), plus real `pricing`
and `about` pages, header/footer/header-action menus, a tagline, three
social links and a footer note — all seeded through the real content store
and the real procedural-media pipeline (`seedDemoMedia`), never mocked.

The `feature` collection gains `icon` (a symbol name `@cogenta/theme-kit`'s
`renderIcon` recognises) and `coverImage`; six real demo features are
seeded (workflow automation, audit log, SSO, integrations, analytics, API),
each with a real icon and cover photo, and the home page's feature grid
links each item to its own real, routed feature page.
