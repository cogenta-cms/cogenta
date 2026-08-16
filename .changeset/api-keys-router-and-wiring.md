---
'@cogenta/api': minor
'@cogenta/cli': minor
---

API keys, wired to the transport (L13 task 8, companion to the
`@cogenta/auth` changeset that adds the store).

`resolveActor` now recognises two bearer-token shapes instead of one: a
session (unchanged) and an API key, told apart by the key's `cogenta_sk_`
prefix before any database lookup runs. A key resolves to an actor whose
`roles` are exactly its granted `scope` — never more, and never derived from
whoever created it — with an id prefixed `apikey:` so it can never collide
with, or be mistaken for, a real user id in the audit log or a `me` route.
Repeated attempts with an invalid key are rate-limited the same way a wrong
password is, keyed on a hash of the attempted key since an unrecognised key
carries no other identity to limit by.

`@cogenta/api` gains `createApiKeysRouter` — `GET`/`POST /api/api-keys` and
`DELETE /api/api-keys/{id}`, admin-only. The raw key is present in exactly
one response body, `POST`'s, and never again: `list()` only ever returns the
12-character prefix a key was minted with.

`@cogenta/cli` mounts the router in `cogenta serve` under `/api/api-keys`
and records `apikey.create`/`apikey.revoke` in the audit log, the same
transport-boundary pattern `recordUserAudit` already uses — the raw key
never reaches the audit entry, only the key's id.

**The admin screen for managing keys lands in the same session**
(`@cogenta/admin`, unpublished/private, no changeset needed) — a new
`/api-keys` route, admin-only, that shows the raw key exactly once in a
dismissable notice right after creation and never again afterwards.

Compromise taken under time pressure, noted rather than hidden: scope is a
flat list of role names rather than a collection-by-collection permission
matrix. A key's actor is checked by the same `PermissionLayer` every other
actor is, so a key can never do more than the roles it was granted allow —
the simplification is in how finely a grant can be sliced, not in whether it
is enforced.
