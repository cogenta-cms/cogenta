---
'@cogenta/core': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Give the redirect table, HTTP security and outbound webhooks a real admin
screen (audit follow-up to L10 tasks 2/6 and L14 task 1)

Three backend pieces existed and were fully wired into `cogenta serve` with
no way to reach them from a browser.

- `@cogenta/core` gains the `REDIRECT_UNKNOWN` error code, for a `DELETE` on a
  redirect that does not exist.
- `@cogenta/api` gains `createRedirectRouter` (`GET`/`POST`/`DELETE
  /api/redirects`) and `createOpsStatusRouter` (`GET /api/security-status`,
  `GET /api/webhooks-status`). Both are admin-only on every method, including
  `GET`: a redirect table and a site's CORS/CSP/HSTS configuration are
  routing and hardening decisions, not content, so neither has a reader role
  the way a taxonomy or a menu does. Loop and self-redirect refusal is
  entirely `RedirectStore`'s own job (`CONTENT_REDIRECT_LOOP`,
  `CONTENT_ROUTE_INVALID`), surfaced here as a proper 409/400 instead of a
  500.
- `cogenta serve` mounts all three at `/api/redirects`, `/api/security-status`
  and `/api/webhooks-status`, and `@cogenta/admin` gains three screens:
  `/redirects` (full CRUD) and `/ops-settings` (`security` and `webhooks`,
  **read-only**).

The security and webhooks screens are read-only by design, not by omission.
Both settings live in the site's `cogenta.config.mjs` — versioned in git,
deployed with the code that depends on it (a CSP that allows a script host
has to travel with the deploy that added the script). Letting the admin edit
them would create a second source of truth that disagrees with the file the
moment either one changes without the other, which is a bigger architecture
change than this audit's scope. The screens instead mirror exactly what the
running process is enforcing on every request.

No delivery history is shown for webhooks: none is persisted anywhere today
(`WebhookEventSender.send` only ever returns a per-call result to log). The
screen says so rather than inventing one.
