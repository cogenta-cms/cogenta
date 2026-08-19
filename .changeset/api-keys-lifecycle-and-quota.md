---
'@cogenta/core': minor
'@cogenta/auth': minor
'@cogenta/api': major
'@cogenta/cli': minor
---

API key lifecycle, rotation and a per-key request quota (fiche 20).

**Breaking (`@cogenta/api`):** `POST /api/api-keys` no longer mints a key that
never expires by default. A request that omits `expiresAt` now gets a
90-day expiry — a real, generous but bounded default, since a key with no
expiry is a key that leaks forever. Pass `neverExpires: true` explicitly to
keep the old "never expires" behaviour. Any script that creates API keys
without setting `expiresAt` will see its keys start expiring after 90 days;
set `neverExpires: true` (or a longer `expiresAt`) if that is not wanted.

New, additive:

- `POST /api/api-keys/{id}/rotate` (`@cogenta/api`, `@cogenta/auth`'s
  `ApiKeyStore.rotate`): mints a replacement carrying the same name, scope
  and quota, and lets the original keep authenticating for a chosen grace
  window (1h/24h/7d) instead of dying mid-flight. The new key's raw value is
  returned exactly once, the same rule `POST /api/api-keys` already follows.
- A per-key request quota (`rateLimitPerMinute`, `@cogenta/auth`), enforced
  once per request by `resolveActor` when a `RateLimitDriver` is supplied.
  Exceeding it answers `429` with `Retry-After` and `RateLimit-*` headers.
  `@cogenta/core` gains the `rateLimit` driver need (`createRateLimitRegistry`,
  a Redis driver and an in-process one — R1: works with no Redis at all) and
  a matching `rateLimit` configuration section; `cogenta serve`/`doctor` wire
  and report it.
- Aggregated 7- and 30-day call counts per key (`ApiKeyStore.usage`), and a
  new admin notice when a key is within seven days of expiring
  (`createApiKeyExpiryNoticeSource`).
- `ApiKey` gains `rateLimitPerMinute` and `supersededBy` (set once a key has
  been rotated). `ApiKeyStore` gains `getById`, `rotate` and `usage`.

New error codes: `API_KEY_RATE_LIMITED` (429), `API_KEY_ROTATION_INVALID`
(409 — a revoked or expired key cannot be rotated), `RATE_LIMIT_FAILED`.

The property that a raw API key is shown exactly once, never twice, holds
for the new rotate response too: `listApiKeys` and the `previous` half of a
rotation response never carry key material.
