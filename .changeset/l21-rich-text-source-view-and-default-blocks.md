---
'@cogenta/schema': minor
---

Add the `content.newEntryDefaultBlocks` editorial site setting to the
site-settings registry (a comma-separated list of contract B block type
names, default `"prose"`). The admin's new-entry flow reads it to pre-fill a
fresh `blocks` field with a sensible starting set instead of an empty array —
purely an admin default: an empty string is a valid, deliberate opt-out
("no starting blocks"), and nothing about `blocks` fields' storage shape or
validation changes. `@cogenta/admin` is unpublished and carries no changeset
of its own for its matching UI (a rich-text toolbar code block, an ordered
list/blockquote already present, and a Markdown/HTML source-view toggle for
the `richText` field editor — all admin-only affordances degrading to
contract A's existing `richText` vocabulary, never a new node type).
