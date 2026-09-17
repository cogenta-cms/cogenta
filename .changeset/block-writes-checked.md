---
'@cogenta/schema': minor
'@cogenta/api': patch
'@cogenta/cli': patch
---

A block saved with an emptied field no longer breaks the public page

Block data was stored exactly as a form sent it and never checked. A hero whose
image had been removed (`media: null`), a feature card with no link, a list
block with an empty sort (`{}`) or a quote with no portrait were accepted, and
the page then answered with an internal error.

`@cogenta/schema` gains `pruneEmptyBlockData`, and the content store now keeps
an emptied optional field as absent — what contract B means and every theme
expects — never inside a rich-text node. `@cogenta/api` checks every block of a
create or an update against the block registry and answers `BLOCK_INVALID`
(400) naming the block and the field, instead of storing it; a block type the
registry does not know is still left to its own renderer. `cogenta serve`
reads block data already stored with empty values the same way.
