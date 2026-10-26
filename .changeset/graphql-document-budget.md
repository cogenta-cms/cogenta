---
'@cogenta/core': patch
'@cogenta/api': patch
'@cogenta/cli': patch
---

Bound the work one GraphQL document can ask for (pentest 2026-10-26, O-01). Pagination and relation depth limited a single field, but nothing limited how many fields a document could repeat through aliases and fragments. `POST /api/graphql` now refuses, before validation and before any resolver or store read, a document with more than 20 root fields (aliases included), more than 1000 field selections after fragment expansion (a repeated spread counts each time), or a depth above 12; the refusal is a `GRAPHQL_QUERY_TOO_COMPLEX` error with HTTP 200, like a validation error. Introspection is exempt from the selection and depth limits and keeps a ceiling of its own. The numbers are measured defaults and can be changed with the new `graphql.limits` configuration section (`maxRootFields`, `maxSelections`, `maxDepth`). A client that sent a larger document must split it or raise the limits.
