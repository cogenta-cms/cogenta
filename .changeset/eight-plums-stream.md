---
'@cogenta/cli': minor
---

`cogenta serve` now streams the file behind a media asset at
`GET /api/media/{id}/file`. It sits outside `@cogenta/api`'s `mediaRouter`
because a binary body has no shape in that router's JSON-only `RestResponse`
— the same treatment `/api/schema` already gets — so it reads the object
through the storage driver and pipes it straight to the response, gated by
the same "signed in at all" rule every other `/api/media` route uses.
