---
'create-cogenta': minor
---

L25 task A0b — procedural demo visuals, real media seeding, and a blueprint's own
default theme/menus/settings, wired end to end for the `store` blueprint.

- New `create-cogenta/dist/demo-art` module: a zero-dependency PNG encoder
  (`node:zlib` deflate + a hand-written CRC-32 table, no image library) and a
  signed-distance-field renderer (soft mesh gradients, anti-aliased geometric
  shapes, deterministic grain) with presets — `heroArt`, `coverArt`, `avatarArt`,
  `logoArt`, `productArt` — each taking the same `Palette` shape as a blueprint's
  `SkinTokens.color`. Deterministic per `seed` (a `mulberry32` PRNG, never
  `Math.random`). A 1600×1000 hero renders in well under the acceptance bound.
- `seedDemoMedia(deps, specs)` (new `blueprints/demo-media.ts`) renders each spec
  and ingests it through `@cogenta/api`'s newly exported `ingestMediaUpload` — the
  exact same pipeline (real-type check, GPS scrub, storage write, variants) a
  human's own upload takes, using the scaffolded site's real storage driver and
  image processor.
- `BlueprintContentPack` gains four optional fields, all additive:
  `defaultTheme` (an npm theme package `scaffoldSite` activates and adds to the
  generated `package.json`), `menus` (header/footer/header-action navigation,
  seeded through the real `MenuStore`), `siteSettings` (seeded through the real
  `SiteSettingsStore`, tolerant of a key the registry does not yet declare — logs
  a warning rather than failing the whole scaffold), and `mediaSpecs` (procedural
  visuals seeded before `seedDemoContent` runs). `SeedDemoContent`'s signature
  changes from three positional parameters to a single `SeedContext` object
  (`{ db, defaultLocale, adminId, media }`) — every existing blueprint updated
  mechanically, `media` unused by all but `store`.
- `ScaffoldResult` gains `activeTheme`/`mediaSeeded`/`menusSeeded`/`siteSettingsSeeded`
  so the installer's own recap can report what was actually seeded.
- `store` is the first blueprint wired end to end: `defaultTheme:
  '@cogenta/theme-ecommerce'`, a hero and six product photos rendered and
  ingested at scaffold time, a new `shop` catalogue page, header/footer menus and
  a header call-to-action, and a starting `general.tagline`. `blank` is
  byte-for-byte unchanged (a new test proves it — no media, no menus, no
  `active_theme` row, identical `package.json`).

Honest cost, measured: seeding `store`'s seven demo images (rendering plus real
variant generation) takes roughly 25-30 seconds on a machine with `sharp`
available, longer on a WASM-only host — most of that is the same real
image-processing cost a human's own upload would pay, not overhead this task
added on top of it. Worth knowing before wiring more blueprints with their own
image sets in the phase that follows.
