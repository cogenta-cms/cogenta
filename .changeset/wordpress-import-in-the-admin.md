---
'@cogenta/api': minor
'@cogenta/cli': minor
---

WordPress import from the admin, not only `cogenta import wordpress` on a
terminal. `@cogenta/api` gains `createImportRouter` (`POST
/api/import/wordpress`), and `cogenta serve` mounts it — admin-only, checked
before the (potentially multi-megabyte) upload body is even read, the same
defensive order `/api/site-plans` already uses for the same reason.

The import logic itself is not duplicated: the router takes an injected
`runWordPressImport` function, and `cogenta serve` wires it to
`@cogenta/import`'s real `importWordPress`, unchanged — `@cogenta/api` gains
no new dependency, the same shape rule `MediaRouterOptions.images` already
follows. A successful import is recorded in the audit log
(`import.wordpress`) with the counts, never the document itself.

The admin gets a screen at `/import`: choose a WordPress "Export All Content"
file, and see the same report `cogenta import wordpress` already prints — what
was imported, what was skipped, and what could not be converted to a block.
