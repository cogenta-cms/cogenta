---
'@cogenta/plugins': minor
---

`loadPlugin` (L7 task 2): resolves a plugin reference (a local path or a
registry package name — mirroring `@cogenta/core`'s `cogenta.config.mjs`
loading convention exactly, `plugin.manifest.{ts,mts,js,mjs}` checked in
order), loads its manifest via a real dynamic `import()`, re-validates it
through `definePlugin` (task 1), and reports engine compatibility using a
new zero-dependency semver-range matcher (`satisfiesRange`, `^`/`~`/exact/
compound comparator ranges — no `semver` npm dependency, per R9). Executes
no plugin code beyond importing the manifest module — worker isolation is
task 3. A git-sourced reference (`git+...`, `github:...`) is recognised and
refused honestly rather than pretending to clone it. Four new
`@cogenta/core` error codes: `PLUGIN_SOURCE_NOT_FOUND`,
`PLUGIN_MANIFEST_FILE_NOT_FOUND`, `PLUGIN_MANIFEST_LOAD_FAILED`,
`PLUGIN_MANIFEST_EXPORT_INVALID`.
