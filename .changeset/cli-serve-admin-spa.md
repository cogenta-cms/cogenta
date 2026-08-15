---
'@cogenta/cli': minor
---

`cogenta serve` now serves the real admin SPA (`@cogenta/admin`) under
`/admin/*`, alongside the public theme render at `/` — there was previously
no way to reach the admin UI from a scaffolded site at all (`/admin` 404'd,
and nothing in the installer's recap explained how to get there). The
admin's own `vite build` is copied into `@cogenta/cli`'s `dist/admin-assets`
at build time (a plain file copy, not a real npm dependency — `@cogenta/admin`
stays `private` and unpublished); a request for a real built asset gets that
exact file (still a real 404 if missing, never silently swapped for HTML),
and any other path under `/admin` gets `index.html` so the SPA's own
client-side router (now mounted with `basename="/admin"`, matching the
build's `base: '/admin/'`) resolves deep links. The API the SPA talks to is
same-origin (`fetch('/api/...')`), so no CORS or separate-origin auth
wiring was needed — that boundary was already designed into
`@cogenta/admin`'s `http.ts`, just never connected to a real server.

Found while answering "how do I log into the admin UI" — the admin app
itself was real and complete (auth, schema-driven editing, media, audit,
agents, fleet), it had simply never been wired to anything a scaffolded
site's `cogenta serve` could reach.
