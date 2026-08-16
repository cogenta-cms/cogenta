---
"@cogenta/theme-canonical": minor
---

Carry each placed block's identity into the rendered HTML, so a reader of the page can map
a rendered element back to the block that produced it.

Two data attributes, both written on every render rather than in a builder-only mode:

- `data-block-key` — contract B's `_key` for the placed block, stamped by `renderPage`
  onto whatever element the block rendered to. It is written in one place, so no block
  renderer has to remember it.
- `data-field` — written by a block renderer on the single element that carries one
  plain-text field's whole value (`hero`'s `title`, `quote`'s `author`, `cta`'s `text`, …).

No element changed shape to get either one: the block snapshots differ by exactly these
attributes and nothing else, so the outline, the styling and the layout are unchanged. Rich
text and repeated list items deliberately carry no `data-field` — a document and a list are
not a text node, and claiming they were would let a caller write a value it cannot address
back.

This is what makes the visual page builder (L16) able to show the real server-rendered page
rather than a React approximation of it: one render path, one output, and the builder's
fidelity test can assert byte equality instead of "close enough".
