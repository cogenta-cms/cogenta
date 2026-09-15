# @cogenta/starters

## 0.1.0

### Minor Changes

- [`ae9338b`](https://github.com/cogenta-cms/cogenta/commit/ae9338b6e95bdbe5d39d8a3db6a954060f9f1546) Thanks [@georgesmomo](https://github.com/georgesmomo)! - New package: the starter content packs `create-cogenta` seeds, now importable
  by other tools. It carries, per site type, the collections and taxonomies, the
  demo entries, the menus, the site settings, the starting skin and the demo
  media (bundled photographs and the procedural `demo-art` renderer), through
  `BLUEPRINT_CONTENT_PACKS`, `seedDemoMedia`, `seedBlueprintMenus`,
  `seedSiteSettings` and `STARTING_SKINS`. Nothing about the content itself
  changes: this is the code `create-cogenta` has always run, moved so that
  `@cogenta/cli` can apply a theme's sample data without depending on the
  installer.

### Patch Changes

- Updated dependencies [[`7711371`](https://github.com/cogenta-cms/cogenta/commit/77113713a5be32d462995565474b0fa546653147), [`bea9ead`](https://github.com/cogenta-cms/cogenta/commit/bea9eadcae2d5d49e3272eeb2437d135ee012c37), [`78989f1`](https://github.com/cogenta-cms/cogenta/commit/78989f11702f3c4e9dfdd0328fc50099fceabd64), [`7944c60`](https://github.com/cogenta-cms/cogenta/commit/7944c609bcc66874b14ab8d4eb950ec337585de0)]:
  - @cogenta/api@2.5.0
  - @cogenta/render@0.3.0
  - @cogenta/core@0.10.0
  - @cogenta/blocks@1.0.5
  - @cogenta/schema@0.5.3
