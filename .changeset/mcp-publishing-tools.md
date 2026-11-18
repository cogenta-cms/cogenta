---
"@cogenta/agents": minor
"@cogenta/cli": minor
"@cogenta/core": minor
"@cogenta/api": patch
---

MCP clients can now publish a bilingual entry without falling back to REST. Four new tools (contract C `tools@1.9`, additive): `content.write_translation` creates the draft of an entry in another site language, linked to it as its translation; `taxonomy.list_terms` and `taxonomy.create_term` read and create tags or categories (creating an existing slug returns it instead of failing); `media.import_url` copies an image from a public https address into the media library through the outbound SSRF guard and the regular media ingest, keeping the author, the licence and the source address (without query string or credentials), with provenance `assisted`. Every write still waits for a human approval, and invalid requests (unknown language, a translation that already exists, an image address that is not public https) are refused before an administrator is asked. New error code `MEDIA_IMPORT_FAILED`.
