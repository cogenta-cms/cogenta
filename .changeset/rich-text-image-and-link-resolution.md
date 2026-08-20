---
'@cogenta/theme-canonical': patch
'@cogenta/cli': patch
---

Fix rich text (`richText` field) rendering when it carries a `media` node or an
`internalLink` mark (ADR-0013): `cogenta serve` now resolves both before rendering, the
same way it already did for a `collectionList` block's entries. Previously, an image
placed inside a paragraph could make the whole page throw (`THEME_IMAGE_UNSUPPORTED`,
the asset was never fetched), and an internal link inside prose always rendered a dead
`<a href="#">` since its target was never looked up.

An internal link whose target cannot be resolved — trashed, still a draft, or renamed
away and gone — now renders as plain text instead of a dead anchor, on `@cogenta/theme-canonical`'s
own recommendation for a stale link: never a 404, never a link to nowhere.
