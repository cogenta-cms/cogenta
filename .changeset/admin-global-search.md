---
'@cogenta/api': minor
---

Global search in the admin header (L11 task 4). `GET /api/media` and
`GET /api/users` both gain an optional `q` query parameter: a case-insensitive
substring match on filename/alt text for media, and on email for accounts.

Neither gets a real index — `q` filters in memory over a bounded scan (the
most recent 200 assets for media, the full account list for users, which the
route already loaded in full). Good enough for the volume an admin media
library or account list holds today; a real index is `@cogenta/schema`'s
search engine (`GET /api/search`, unchanged here), built for content.

Both routes keep the permission check they already had *before* applying the
filter: `/api/media` still requires a signed-in actor, `/api/users` still
requires the `admin` role. `q` narrows what an already-permitted caller sees,
it never widens it (R4).

The admin's new global search box (topbar, `packages/admin/src/shell/`) calls
`/api/search`, `/api/media` and `/api/users` in parallel — three real calls
rather than one aggregated route, since aggregating server-side would still
make the same three calls internally for no real benefit.
