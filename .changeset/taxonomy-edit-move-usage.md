---
"@cogenta/schema": minor
"@cogenta/api": minor
---

Taxonomy terms can now be edited (multi-locale labels, slug) and moved to a new parent without losing classification, per ADR-0022's materialised-path model. `GET /api/taxonomies/{name}` gains `?q=` (accent- and case-insensitive search), `?counts=1` (per-term entry counts, direct and with descendants) and `?unused=1` (terms nothing classifies), each permission-gated the same way ordinary content reads are. `countTaxonomyUsage` is a new export of `@cogenta/schema`.
