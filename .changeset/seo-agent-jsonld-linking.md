---
'@cogenta/agents-builtin': minor
---

Add the second half of the SEO agent: `buildArticleJsonLd`/`validateJsonLd`
(schema.org generation and verification), `proposeInternalLinks` and
`detectCannibalization` (topical similarity via the RAG hashing
embedding provider), `findOrphanedRedirects` (chain-aware, cycle-safe),
and `validateLlmsTxt` (the AEO/GEO `llms.txt` shape check).
