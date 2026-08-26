---
"@cogenta/core": minor
"@cogenta/schema": minor
"@cogenta/api": minor
"@cogenta/cli": minor
---

Fiche 63 (ADR-0028) — a role's grant on a collection or taxonomy action can
now be overridden in the database, applied on the very next request with no
deploy cycle. `cogenta.schema.*`'s `permissions` block stays the source of
truth for a site that never writes an override; the database is checked
first and falls back to the file, never the other way around.

`@cogenta/core` gains three error codes: `ROLE_PERMISSION_TARGET_UNKNOWN`
(404 — an override names a collection/taxonomy the site does not declare),
`ROLE_PERMISSION_INVALID` (400 — a malformed override, including `own` on a
taxonomy, which has no author) and `ROLE_PERMISSION_EXPORT_INVALID` (a
malformed `cogenta roles export` file being read back).

`@cogenta/schema` gains `createRolePermissionStore` (validates every write
by folding the candidate rule into the real `CollectionDefinition`/
`TaxonomyDefinition` and reusing `defineCollection`/`defineTaxonomy`
unmodified — no second validation logic), `createRolePermissionOverlay` (the
synchronous, refreshable read-through cache `PermissionLayer` consults),
`ensureRolePermissionTable`/`ROLE_PERMISSIONS_TABLE`, and
`serialiseRolePermissionExport`/`parseRolePermissionExport` for freezing the
table's state into a versioned JSON file. All additive; contract A
(`CollectionDefinition`, `TaxonomyDefinition`, `CollectionPermissions`) is
unchanged — the override table lives entirely outside the contract.

`@cogenta/api`'s `createPermissionLayer` gains an optional
`rolePermissionOverrides` option (a `RolePermissionOverrides` from
`@cogenta/schema`) — absent behaves byte-for-byte as before. A new router,
`createRolePermissionRouter`, serves `GET`/`PUT /api/role-permissions` and
`DELETE /api/role-permissions/{targetType}/{targetName}/{action}`,
admin-only. `STATUS_BY_CODE` gains the two new HTTP-mapped error codes above.

`@cogenta/cli` wires the override store and overlay into `cogenta serve`
(mounting `/api/role-permissions`, journaling every successful write to the
audit log), `cogenta mcp` and `cogenta channels` (each builds its own
`PermissionLayer`, so each needed the same wiring — otherwise a permission
revoked in production would stay granted to those processes until restart).
A new command, `cogenta roles export [--out <path>]`, freezes the table into
a file a site can commit to git.
