---
'@cogenta/auth': minor
'@cogenta/api': minor
---

An API key's name, scope, and rate limit can now be changed from `/admin/api-keys` without reissuing its secret. Previously the only write path after creation was "rotate", which mints a fresh secret under the *same* name/scope — there was no way to fix a typo'd name, widen or narrow a key's role scope, or adjust its request quota without rotating (a new secret an integration would need to be given again) or revoking and recreating (losing usage history and continuity).

- `ApiKeyStore.update()` (`@cogenta/auth`) accepts a tri-state patch: a field absent from the patch is left exactly as saved, `rateLimitPerMinute: null` clears an explicit quota back to the default, and a value sets it. Never touches the key's secret, prefix, or lifecycle fields (`expiresAt`/`revokedAt`/`supersededBy`) — rotate to change the secret, revoke to end the key.
- `PATCH /api/api-keys/:id` (`@cogenta/api`) carries the same tri-state semantics for `name`/`scope`/`rateLimitPerMinute` — still admin-only, unchanged authorization.
- Admin: an "Edit" action on each active key's row (disabled once revoked or superseded, same as rotate) opens a dialog — pre-filled from the row — that saves through this PATCH path, never showing or asking for the secret.
