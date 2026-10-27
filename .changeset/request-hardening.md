---
'@cogenta/cli': patch
'@cogenta/api': patch
'@cogenta/core': patch
---

`cogenta serve` no longer lets a `multipart/form-data` Content-Type raise the anonymous body limit on any route: the 26 MiB budget is reserved for the public form submission route, and `/api/auth/*` refuses a non-JSON body with 415 (`REQUEST_UNSUPPORTED_MEDIA_TYPE`, new in `@cogenta/core`). Malformed input is a client error instead of a 500: an incomplete percent-escape in a path and an unterminated JSON body answer 400 `QUERY_INVALID`, and any typed error with a 4xx status is no longer reported as an internal failure.
