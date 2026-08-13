---
'@cogenta/schema': minor
'@cogenta/core': minor
---

Add the core of `@cogenta/schema`: `defineCollection`, the fourteen field types of
contract A, the system fields, and the two generated artefacts.

`f.text()`, `f.richText()`, `f.slug()`, `f.number()`, `f.boolean()`, `f.date()`,
`f.datetime()`, `f.media()`, `f.relation()`, `f.select()`, `f.json()`, `f.geo()`,
`f.color()` and `f.blocks()` each produce a plain, serialisable field definition and a
Zod validator derived from it — one validator, generated from the schema, never a second
one written by hand next to it.

`defineCollection` checks a definition at import time and reports **every** problem at
once, each located by the field it concerns (`fields.author.onDelete`,
`indexes[0]`, `routing.pattern`), rather than one per run. A default value the field
itself would reject, a slug derived from a field nobody declared, `'setNull'` on a
required relation, an action outside the five of the contract: all refused before a
migration exists.

`renderTypeDeclarations()` produces `.cogenta/types.d.ts` — one interface per collection,
extending the system fields, importing nothing so a theme compiles against it without
depending on the schema package. A theme reading a field that no longer exists now fails
to build, which is the acceptance criterion of L1. `renderSchemaJson()` produces
`.cogenta/schema.json`, the description the admin reads. Both are pure functions
returning strings; the CLI writes the files.

`richText` stores the restricted Portable Text document of ADR-0013 — no HTML, no `h1`,
internal links referencing an entity rather than a URL — and rejects a mark that no
`markDefs` entry defines or two nodes sharing a `_key`. Ids are application-minted
UUIDv7 (ADR-0015), monotonic inside a millisecond so they stay ordered.

Core gains the `SCHEMA_INVALID` error code.
