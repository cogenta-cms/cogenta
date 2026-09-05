---
'create-cogenta': minor
---

L25 Annexe pro pass on the `portfolio` blueprint, to match
`@cogenta/theme-portfolio`'s own pro pass.

`project` gains `coverImage` (`f.media`) and an optional `blocks` field (a
per-project, auto-built "Role / Year" panel — see the `theme-portfolio`
changeset for why). Eight demo projects replace the previous three, each
with distinct studio copy and a `coverArt` composition seeded so the eight
covers read as genuinely different families, not a repeated palette. The
home page grows from three blocks to the full nine of the Annexe brief:
`hero` (an "editorial mark on dark" backdrop), `collectionList` "Selected
work" (`grid`, 6), `stats`, `featureGrid` "Services" (three real icons),
`logoStrip` "Clients" (five marks), `quote`, `collectionList` "The full
index" (`list`, all 8), `testimonial`, and a closing `cta`. `about`,
`contact` and `legal` pages are added (`about` keeps its existing prose +
stats; `contact` and `legal` are new, since the header/footer navigation
below links to both). Real menus are seeded — header (Work/Services/About/
Contact, the first two as real in-page anchors this theme's own `renderPage`
now honours), footer (Work/About/Contact/Legal), and a `headerAction`
("Let's talk" → `/contact`) — plus `general.tagline`, three
`general.socialLinks`, and a `general.footerNote`. `defaultTheme` is set to
`@cogenta/theme-portfolio`.

**A real, verified mismatch found and fixed**: `starting-skins.ts`'s
`portfolio` entry was a terracotta, soft-shadow, system-font palette dating
from L22 task 10 — written before `@cogenta/theme-portfolio` (a brutalist,
violet-accent, hard-offset-shadow, Bricolage Grotesque/Fraunces/JetBrains
Mono theme) existed. A freshly scaffolded `portfolio` site therefore ran
this theme's real CSS against a palette it was never designed around.
Brought into exact alignment with `packages/theme-portfolio/tokens.json`
(colour, font stack, scale, radii, motion, shadow) — verified by scaffolding
a real site and reading the written `theme.tokens.json` back.

`buildPortfolioHomeBlocks`/`buildPortfolioDemoPages` replace the previous
`PORTFOLIO_DEMO_PAGES` constant (now built from `SeedContext.media`, the
same pattern every other L25-era blueprint already uses) —
`test/blueprint-demo-blocks.test.ts`'s portfolio import is updated
accordingly (`buildPortfolioDemoPages({})`), unaffected in what it checks.

Verified: `typecheck`, `build`, and `test/portfolio-blueprint.test.ts`
(11/11, rewritten for the new content and given explicit per-test timeouts
— this blueprint now renders/ingests sixteen procedural media compositions
per `scaffoldSite` call, above the 5s default on this machine),
`test/blueprint-demo-blocks.test.ts` and `test/starting-skins.test.ts`
(both green, unaffected in what they assert). A real site was scaffolded
with `--config`, served with the workspace's own `cogenta serve`, and
inspected in a real browser at 360/768/1280 on the home, a project and the
about page — the mobile menu was actually opened and closed.
