---
'@cogenta/starters': minor
---

New package: the starter content packs `create-cogenta` seeds, now importable
by other tools. It carries, per site type, the collections and taxonomies, the
demo entries, the menus, the site settings, the starting skin and the demo
media (bundled photographs and the procedural `demo-art` renderer), through
`BLUEPRINT_CONTENT_PACKS`, `seedDemoMedia`, `seedBlueprintMenus`,
`seedSiteSettings` and `STARTING_SKINS`. Nothing about the content itself
changes: this is the code `create-cogenta` has always run, moved so that
`@cogenta/cli` can apply a theme's sample data without depending on the
installer.
