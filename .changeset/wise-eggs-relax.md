---
'@cogenta/admin': minor
---

Add one field component per schema field type (L2 task 5): `text` (with a `multiline`
textarea variant), `slug`, `number`, `boolean`, `date`, `datetime`, `select`, `color`,
`geo`, and `json`, dispatched through a single `FieldInput` so a new field kind is a new
`case`, never a change to whatever renders a collection's form around it.

`richText`, `media`, `relation` and `blocks` get honest placeholders naming the task each
lands with (8, 11, 7, 9) rather than a half-built editor that would silently mishandle
what it can't yet represent — `richText` and a `select` marked `many: true` follow the
same rule: `richText` edits its serialised tree as raw JSON rather than pretending to be
a real editor, and a many-valued `select` refuses to render rather than editing a list as
if it were one string.

Every component is a controlled input against `FieldWrapper` (label, required marker,
help text) and nothing else — no data fetching, no validation beyond native HTML
constraints matching the field's declared options. Wiring them into an actual
schema-driven form is task 7.
