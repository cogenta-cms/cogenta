---
'@cogenta/core': patch
'@cogenta/cli': patch
'create-cogenta': patch
---

Run behind a reverse proxy and in a container.

- `cogenta serve` answers `GET /livez` (the process is up, no I/O) and `GET /readyz` (the database answers `select 1` within three seconds, and the server is not shutting down) for orchestrators. Both are anonymous, return a bare word with `cache-control: no-store`, and are handled before the security headers, the session lookup, the request quota, tracing and the page router: never rate limited, never a 404 in the log. `/api/health` stays admin-only. The two paths are reserved, so a page whose slug is `livez` or `readyz` is unreachable.
- New `security.trustProxy` (env `COGENTA_TRUST_PROXY`), off by default so nothing changes for a site that does not set it. `cloudflare` or a header name (`cf-connecting-ip`, `x-real-ip`…) trusts that one header for the client address; a number N reads the Nth entry from the right of `x-forwarded-for`, the end a visitor cannot prepend to. An address that is missing, malformed, or beyond the chain falls back to the socket's. One function decides the address and every consumer uses it: the login limiter, the comment, form and unlock limiters, comment moderation, analytics hashing. `x-forwarded-proto` keeps deciding whether a request is HTTPS, and with a hop count the entry for that hop is read. Behind an ingress and a CDN the per-address limits are per visitor again instead of one global limit; keep the pod reachable only through the proxy, because a header typed by a client cannot be told from the proxy's.
- `create-cogenta`'s `scaffoldSite` accepts `secretsFromEnvironment` (no `.env` is written, and a server database URL stays out of `cogenta.config.mjs`) and `adminPassword` (used instead of a generated one, and not echoed). `runUsers` accepts `password` for `create`; the command line still does not, since an argument is visible to every process on the machine.
