---
"@cogenta/import": patch
"@cogenta/cli": patch
---

`@cogenta/import` now takes its SSRF guard from `@cogenta/core` (same exported names, same `IMPORT_MEDIA_URL_UNSAFE` error). `cogenta links check` reports links into private networks as "points into a private network and was not requested", and the plugin runtime uses the guarded `http.fetch` transport by default.
