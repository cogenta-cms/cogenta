---
'@cogenta/schema': minor
---

Validate every written value against the schema its collection declares.

`validation.ts` builds a validator per field and has described itself as "the
validator that guards every write" since L1. The write path never called it:
values were type-checked by hand and otherwise stored as sent. A `text` field
declaring `max: 60` accepted 250 characters, a `slug` accepted
`"Not A Slug!!"` and went on to route a public URL, a `boolean` accepted the
string `"yes"` and coerced it to `true` (so `"false"` would have stored
`true`), and a `richText` field accepted a plain string.

Values are now parsed, not merely checked, which is also what makes a schema's
defaults apply: a Portable Text span that legitimately omits `marks` — the
field is optional in the spec — now reaches the column with `marks: []`
instead of arriving half-formed and throwing in the first reader that counts
them.

**This refuses writes that used to be accepted.** A caller sending a value its
own schema forbids now gets `CONTENT_INVALID`, naming the field and the reason.
Stored rows are untouched; this is the write path only.

Two exceptions, both documented in the code: `date`/`datetime` keep their own
handling (they accept a `Date` and the empty string, which is how the admin
clears a date), and `media`/`relation`/`taxonomy` keep the shape check they had
rather than gaining the UUID check their declared schema would impose — that
tightening is a decision of its own.
