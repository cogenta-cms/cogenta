---
'@cogenta/api': minor
---

Report an entry's visibility when it is read back.

`SerialisedEntry` carried `deletedAt` (ADR-0022) and `reviewState`
(ADR-0027) — the two system fields orthogonal to `status` — and quietly not
`visibility` (ADR-0037), whose own doc comment says it is orthogonal to
`status` "exactly as `deletedAt` and `reviewState` are". The pattern was
followed twice and missed on the third.

The admin declares the field optional, so it read `undefined` for every
entry and fell back to `'public'`. Two symptoms, one cause: a private page
displayed "Public", and the control was disabled when you selected "public"
because the interface believed it already was — so a page made private could
not be made public again from the interface at all.

The password is still never returned: only its hash is stored, and no read
exposes it. The field is required on `SerialisedEntry`, like its two
neighbours, so a serialiser that forgets it fails to compile.

The end-to-end visibility suite proved what a visibility *does* — a 404, a
password form, an absence from the sitemap — and never read the state back,
which is why five passing tests covered a control nobody could use.
