---
'@cogenta/core': minor
'@cogenta/auth': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

API keys gain the last two lifecycle actions fiche 20 left open: purge and
recovery from a mistaken revocation (fiche 62).

`ApiKeyStore` (`@cogenta/auth`) gains `purge(id)` — a real, permanent
`DELETE` of the key row and its usage history, refused unless the key has
been revoked for at least `MIN_PURGE_AFTER_REVOKED_DAYS` (30, newly exported)
— and `recover(id)` — mints a replacement carrying the same name, scope and
quota as a key revoked by mistake, without ever lifting that key's
`revokedAt` back to `null`. Recovery only works within
`RECOVERY_WINDOW_MS` (24h, newly exported) of the revocation; past that
window, or for a key that was never revoked, both throw the two new error
codes below. This is decision (b) from fiche 62's own recommendation: a
revoked key is usually revoked for a security reason, so recovery mints a
new credential rather than silently reactivating a possibly compromised one.

`@cogenta/core` gains two error codes: `API_KEY_PURGE_INVALID` and
`API_KEY_RECOVERY_INVALID` (both mapped to HTTP 409 — the id names something
real, refused only because of its current state).

`@cogenta/api`'s `/api/api-keys` router gains `DELETE .../purge` and
`POST .../recover`, both admin-only, following the same request/response
shape as the existing `rotate` route (the raw key appears exactly once, in
the `recover` response).

`cogenta serve` (`@cogenta/cli`) records `apikey.purge` and `apikey.recover`
in the audit log, alongside the `apikey.create`/`apikey.rotate`/
`apikey.revoke` entries that already existed — every API key lifecycle
mutation now produces a verifiable audit entry, closing the gap fiche 20
first flagged.
