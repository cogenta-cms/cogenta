---
'@cogenta/cli': patch
---

Fix `cogenta serve` crashing on Windows the moment `cogenta.schema.ts`
doesn't exist, instead of falling through to the next candidate filename
(`.mts`, `.mjs`, `.js`).

`loadCollections`'s `isModuleNotFound` decided whether a missing candidate
was safe to skip by checking that the thrown error's message contained the
candidate's `file://` URL. On Windows, Node's own `ERR_MODULE_NOT_FOUND`
message embeds the raw OS path (`C:\...`) instead of the URL form, so the
check never matched — the first missing extension in the candidate list
(typically `.ts`, since most real sites use `.mjs`) surfaced as a hard
`SCHEMA_INVALID` failure rather than being silently skipped.

Now matches either form. Found via the same end-to-end local-registry test
that surfaced the `create-cogenta` blank-schema bug (see that changeset) —
after fixing the schema file itself, `cogenta serve` still failed on
Windows specifically, for this unrelated reason.
