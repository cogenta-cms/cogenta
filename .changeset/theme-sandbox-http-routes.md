---
'@cogenta/core': minor
'@cogenta/cli': minor
---

Fiche 73 follow-on — wires tasks 4-8's mechanisms into real `cogenta serve` HTTP routes,
admin-only throughout (the same gate every other theme route already has):

- `POST /api/theme/sandbox` — create a sandbox, or clone an existing local theme into one
  (`{id, cloneFrom?}`).
- `GET /api/theme/sandbox/:id/preview` — renders the sandbox through the isolated worker
  (task 4), `?siteName=` optional.
- `GET /api/theme/sandbox/:id/check?themeName=` — the deploy pipeline's read-only scan
  (task 5), safe to poll from a confirmation screen.
- `POST /api/theme/sandbox/:id/deploy` — promotes a sandbox into `themes/<name>/`
  (`{themeName}`), re-checking itself before touching anything.
- `GET /api/theme/:name/versions` — lists archived versions (task 6), newest first.
- `POST /api/theme/:name/versions/:timestamp/restore` — restores one.
- `GET /api/theme/:name/export` — a real streamed zip download.
- `POST /api/theme/import` — `{sandboxId, zipBase64}`, extracts into a fresh sandbox
  (task 8) — never deploys on its own.

`RuntimeExtras` gains an optional `projectRoot` — `createRequestListener` needed it and
had no prior access (`ThemeRouter` deliberately never gets a real filesystem path, per
contract D). Two new `@cogenta/core` error codes:
`THEME_SANDBOX_REQUEST_INVALID`/`THEME_SANDBOX_ROUTE_NOT_FOUND`.

7 new real HTTP tests (`packages/cli/test/serve-theme-sandbox.test.ts`, a real
`cogenta serve` instance, real auth, no mocks): admin-only gating (refused for both an
anonymous and an `editor` caller), the full create → preview → check → deploy round trip,
a real refusal reason surfaced through `/check` without deploying, versions
list-then-restore across two real redeploys, a real downloadable zip re-opened and
verified with `openZip`, base64 zip import over HTTP, and the route's own 404 for an
unmatched sub-path. The underlying mechanisms already have their own thorough unit
suites (including every security-hardened path guard) — this suite proves the HTTP layer
routes to them correctly, not the guards again.

No admin screen (React UI) yet for any of this — an honest, deliberately scoped-out next
step: this delivers the API surface an admin screen would call, tested end to end over
real HTTP.
