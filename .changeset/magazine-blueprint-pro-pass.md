---
'create-cogenta': minor
---

Richens the `magazine` blueprint to match `@cogenta/theme-magazine`'s L25 pro pass.

`article` gains `coverImage: f.media({ accept: ['image'] })`. Twelve published demo
articles across four sections (News, Culture, Opinion, Business — three each), credible
headlines and copy, each with a real procedural cover image (`coverArt`, via
`seedDemoMedia`). `home` grows from 3 to 9 blocks: the lead article's own `hero`, a
"Top stories" front-page `collectionList` (`layout: 'grid'`, 7 entries), one rubric-rail
`collectionList` per section (`layout: 'list'`, `filter: { section }`, 4 entries each — the
first blueprint in this repo to use `collectionList.filter`), a newsletter `cta`, a reader
`quote` (with a procedural avatar) and a "Partners" `logoStrip` (5 procedural logo marks).
Header/footer/`header-action` menus, `general.tagline`/`socialLinks`/`footerNote`, and
`defaultTheme: '@cogenta/theme-magazine'` are all seeded through the real stores, the same
pattern every other L25 blueprint uses.

`buildMagazineDemoPages(media)` replaces the old `MAGAZINE_DEMO_PAGES` constant (same
`media: Readonly<Record<string, string>>` → pages shape every other richened blueprint
uses since L25 task A0b) — called with `{}` it still renders a valid `home`/`about`, minus
the now-media-dependent hero cover, quote avatar and "Partners" strip (contract B requires
at least one item, so an empty logo list is omitted rather than sent empty).

Fixes `test/magazine-blueprint.test.ts` and `test/blueprint-demo-blocks.test.ts` to match:
updated slugs/titles, the new home-page block keys (`demo-home-top-stories`,
`demo-home-rail-<section>`), and a fake `RenderContext.image()` that returns a real
`ImageSource` instead of throwing, now that the hero genuinely carries the lead article's
own cover.
