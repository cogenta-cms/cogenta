---
'@cogenta/schema': minor
'@cogenta/blocks': minor
'@cogenta/theme-kit': minor
'@cogenta/theme-canonical': minor
---

Fiche 42 task 2 — the rich text vocabulary (contract A, ADR-0013) gains a
`strikethrough` decorator and an `hr` (thematic break) node, both additive:
`RICH_TEXT_DECORATORS` now includes `'strikethrough'` alongside the existing
`strong`/`em`/`code`, and `richTextNodeSchema` accepts a third node shape,
`{ _key: string, _type: 'hr' }`, carrying nothing beyond its key. No existing
document changes shape — a `richText` value stored before this change parses
identically after it. A consumer still on the previous minor cannot validate
a document that uses either addition, the same one-directional compatibility
already accepted for `schema@2.1`'s `reviewState` and `tools@1.1`'s
`document.extract`.

`@cogenta/blocks`'s own temporary mirror of the richText shape (used to
validate a `prose`/`quote`/`testimonial`/`faq`/`accordion` block's body)
gains the same `hr` node — its `marks` field was already an open string
array, so `strikethrough` needed no change there.

`@cogenta/theme-kit`'s `renderRichText` — the single function every theme in
this monorepo imports rather than reimplementing (`@cogenta/theme-canonical`
and the four site themes' `blocks/prose.ts` all call it directly) — renders
`strikethrough` as `<s>` (semantically "no longer accurate", not `<del>`,
which would imply an edit-tracking deletion) and a thematic break as a bare
`<hr class="cg-prose__rule">`. `@cogenta/theme-canonical` re-exports the
same function unchanged; its own `prose` block snapshot fixture now
exercises both additions end to end.

`@cogenta/admin` (private, no changeset) gains the corresponding editor
support: a strikethrough toolbar button, a horizontal-rule insert button and
slash-menu entry, Markdown (`~~text~~`, a bare `---` line) and HTML (`<s>`,
`<hr>`) source-view round-tripping, and clean-paste recognition of `<s>`/
`<strike>`/`<del>` and a pasted `<hr>` (previously dropped outright).

Same commit also fixes an unrelated, pre-existing CSS bug (fiche 42 task 1):
`.rich-text-editor__surface` had no `min-height` outside fullscreen, so a
freshly opened entry's editing area measured exactly one line. `@cogenta/admin`
only; no published-package surface involved.
