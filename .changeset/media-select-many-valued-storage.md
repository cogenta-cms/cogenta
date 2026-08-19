---
"@cogenta/schema": patch
---

`f.media({ many: true })` and `f.select({ many: true })` now actually store more than one
value. Both options have existed on the public field constructors since contract A shipped,
and `validation.ts` already validated an array against them (`manyOf`) — but
`columnTypeFor`/`encodeFieldValue` treated every `media`/`select` field as a single scalar
column regardless of `many`, so a genuine array threw `CONTENT_INVALID` ("expects a string,
not object") the moment it reached the store. No site could ever have used either option
successfully; this was found while wiring `@cogenta/admin`'s media and select field editors
to a real gallery/many-choice UI, which needed the option to actually work.

Fixed the same way a to-many `relation`/`taxonomy` field is fixed, minus the join table:
neither `media` nor `select` has anything on the other end a foreign key could enforce (a
media asset lives in its own subsystem; a select choice references nothing), so the ordered
array is JSON-encoded straight into the field's own column instead — the same encoding
`richText`/`json`/`geo` already use. An unset many-valued field now defaults to `[]`, never
`null`, matching the same rule a to-many relation's empty case already followed.

No migration: nothing could have written a value in the old shape (every write attempt threw),
so there is no data to move.
