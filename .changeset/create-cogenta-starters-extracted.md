---
'create-cogenta': patch
---

Moves its content packs to `@cogenta/starters`; public exports unchanged.
`BLUEPRINT_CONTENT_PACKS`, `BlueprintContentPack`, `RecommendedAgentHint` and
`SeedDemoContent` are re-exported from the new package, and
`npm create cogenta` scaffolds the same files, tables and rows as before.
