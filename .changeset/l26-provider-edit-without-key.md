---
'@cogenta/agents': minor
'@cogenta/api': minor
---

A saved provider's model, base URL, and tuning (max output tokens / request timeout / correction attempts) can now be edited from `/admin/providers` without re-entering its API key. Previously the only write path was the top form's full upsert, which requires `apiKey` — since a saved key is never redisplayed, an admin who wanted to raise `maxOutputTokens` on an already-configured provider had no way to do it short of generating a brand-new key and re-pasting it.

- `ProviderConfigStore.updateSettings()` (`@cogenta/agents`) now accepts the three tuning fields as a tri-state patch: a key absent from the patch leaves the saved value untouched, an explicit `null` clears it back to the built-in default, and a number sets it. The existing `apiKey`-bearing `upsert()` is unchanged.
- `PATCH /api/providers/:provider` (`@cogenta/api`) carries the same tri-state semantics for `maxOutputTokens`/`requestTimeoutMs`/`maxCorrectionAttempts` (a present-but-empty field clears to default, matching how `model`/`baseUrl` already behaved) — still admin-only, unchanged authorization.
- Admin: a "Modifier" action on each provider row opens a dialog — pre-filled from the row, no API key field anywhere in it — that saves through this PATCH path.
