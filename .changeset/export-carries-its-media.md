---
'@cogenta/export': minor
'@cogenta/cli': minor
---

Actually write the media references `cogenta export` has always claimed to write.

The command printed "7 media references" over a file that contained none:
`exportMediaReferences` and `exportMediaArchive` were complete, tested, and called by
nothing. Every entry imported from such a file pointed at an identifier the target site
could not resolve. `exportContent` now emits a `media-ref` record per referenced medium
when it is given a `media` store, and `counts.mediaRefs` counts **records written**
rather than media found — so the number and the file can no longer disagree.

`ExportContentOptions` gains `mediaIn`, an optional per-entry resolver for media this
package cannot see by itself. Most of a real site's pictures live inside contract B
blocks and rich text rather than in declared `f.media()` fields, and finding those means
reading the block vocabulary, which `@cogenta/export` depends on neither directly nor
through `@cogenta/api` (R9). So the caller is asked instead: `cogenta export` passes a
resolver backed by the same `collectDependencies` the REST layer uses to declare a
response's dependencies. Without it, an export still carries every declared media field
and undercounts a site by roughly half — which is what it did before.

`cogenta export` also gains `--media-archive <file>`, writing a ZIP of the referenced
media's bytes for the case the target site does not share the source's storage.
