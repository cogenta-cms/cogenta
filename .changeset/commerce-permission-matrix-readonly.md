---
"@cogenta/commerce": minor
---

`GET /api/commerce/permissions` — a read-only route answering contract E's own
permission vocabulary (`COMMERCE_PERMISSIONS`) and which roles this site actually grants
each one. Needs `commerce.read`, the same as every other read route.

`CommercePermissionLayer` gains a `roles` field: the resolved role→permissions map this
layer is actually enforcing (`DEFAULT_COMMERCE_ROLES` unless `CommercePermissionOptions.roles`
overrode it). A structural, additive change to the interface — every existing
`createCommercePermissions()` caller still compiles and behaves identically; only a
caller that builds its own object literal satisfying `CommercePermissionLayer` by hand
(none does in this codebase) would need to add the field.

Both exist so fiche 19's admin permission matrix can render what this layer really
enforces instead of a copy of `DEFAULT_COMMERCE_ROLES` hand-typed into the admin bundle,
which would silently go stale the day a site passes `roles` to override the defaults.
