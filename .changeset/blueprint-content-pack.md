---
'create-cogenta': patch
---

Internal refactor: generalizes the `blog` blueprint's hardcoded
`blueprint.id === 'blog'` scaffolding branch into a `BlueprintContentPack`
extension point (`packages/create-cogenta/src/blueprints/content-pack.ts`,
`content-packs.ts`) — a blueprint's collections, recommended agents and
demo-content seeding are now looked up generically by id. No behavior
change for `blog` or `blank`; this is preparation for L9 task 8 (the seven
remaining blueprints), each of which now only needs to add its own content
pack and a registry entry rather than another branch in `scaffold.ts`.
