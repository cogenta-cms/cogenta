---
'@cogenta/agents': minor
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Five publishing tools become reversible, with a real `revert` (contract C, `tools@1.10`).

`content.write_draft`, `content.write_translation`, `content.publish`, `taxonomy.create_term`
and `media.import_url` now carry what their undo needs in their own output and implement
`revert()`. A created draft or translation goes to the trash; an updated draft gets its
previous working version back as a new version; a publication goes back to the draft status
it replaced, or to the version that was public before; a created term is deleted only while
no entry (trash and drafts included) carries it; an imported image is deleted only while no
entry references it. Each `revert` refuses with the new `TOOL_REVERT_REFUSED` code (HTTP 409)
instead of guessing when the entry was edited since, or the term or image is in use.

A tool is reversible only when its host supplies the undo operations
(`ContentServiceLike.restore`/`unpublish`, `TaxonomyServiceLike.usage`/`delete`,
`MediaImportUrlToolOptions.removeImage`, all optional): without them it stays
`reversible: false` and waits for a human, as before — the internal agent runtime is
unchanged. `cogenta serve` supplies them all.

New exports: `countTermReferences` (`@cogenta/schema`), `removeMediaAsset` (`@cogenta/api`,
now also used by `DELETE /api/media/{id}`). `createMcpToolSource(...)` returns a source with a
`revert(toolName, receipt)` seam an administration screen can call; nothing calls it yet.
`taxonomy.create_term` also returns the `taxonomy` its term belongs to.
