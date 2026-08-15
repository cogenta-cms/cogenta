---
'@cogenta/schema': minor
---

`ContentStore` gains `duplicate(id, input?)`: it copies an entry's values,
relations and block zones into a brand-new draft (L13 task 4). No contract A
change — it composes `read` and `create`, and duplication is covered by the
already-frozen `create` action, so no sixth permission action was invented.

Four behaviours are decisions rather than defaults, and each is tested:

- **The copy always starts its own translation family** (`translationOf` is
  null even when the source is itself a translation). Two rows of the same
  family sharing a locale would make `resolveLocale` choose between them
  arbitrarily — it returns the first match — and would list the copy in
  `translations()` as if it were another language.
- **A unique field gets a derived, free value** (`sido` → `sido-copy` →
  `sido-copy-2`), probed inside the same transaction as the insert. Without
  it the first duplicate of the commonest collection shape there is — an
  article with a unique slug — would fail on a raw unique-index violation. A
  unique field that is not text cannot be derived, and refuses with
  `CONTENT_INVALID` naming the field instead of guessing.
- **Copied blocks get fresh `_key`s.** A key anchors comments and RAG chunks;
  the same key in two entries would make a key alone meaningless as an anchor.
- **Provenance is carried over, not reset to `human`.** Duplicating generated
  content does not make it human-written. Pass `provenance` to say otherwise.

`publishedAt` is always cleared, the copy is always a `draft` at version 1
with its own empty history, and it copies the **working** state — what the
editor is looking at — not the published version underneath.
`withReadOnlyStore` refuses `duplicate` like every other mutation.
