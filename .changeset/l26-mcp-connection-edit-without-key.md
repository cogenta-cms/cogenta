---
'@cogenta/mcp': minor
'@cogenta/api': minor
---

A saved MCP client connection's command, arguments, environment, URL, auth kind, and secret can now be edited from `/admin/mcp-clients` without deleting and recreating it. Previously the only write paths were `PATCH .../{id}` for `enabled` and `PUT .../{id}/exposed-tools` — changing anything else (a wrong command path, a new environment variable, a rotated secret) meant deleting the connection and losing its already-validated exposed-tool selection.

- `McpConnectionStore.update()` (`@cogenta/mcp`) accepts a tri-state patch: a field absent from the patch is left exactly as saved, a given value replaces it. Setting `authKind` back to `"none"` clears the saved secret; a new `secret` re-encrypts and replaces it, otherwise the saved secret is never touched (there is no way to read it back to resend unchanged).
- `PATCH /api/mcp-connections/:id` (`@cogenta/api`) now carries `name`/`command`/`args`/`url`/`env`/`authKind`/`secret`/`secretEnvVar` alongside the existing `enabled` — still admin-only, unchanged authorization.
- Admin: a "Modifier" action on each connection row opens a dialog — pre-filled from the row, with the secret field always blank (never re-shown) — that saves through this PATCH path.
