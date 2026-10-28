---
'@cogenta/cli': patch
'@cogenta/schema': patch
'@cogenta/core': patch
---

A NUL byte (`%00`) or another control character in a URL path is no longer a 500 on Postgres. `cogenta serve` answers 404 for a public path and 400 `QUERY_INVALID` for an API path before any lookup; `/_image?id=%00` is a 404; the content store (text filters and `locale`), the taxonomy store (`bySlug`) and the media store (`get`) answer "no row" for a value Postgres cannot hold instead of sending the statement.
