---
'@cogenta/core': minor
'@cogenta/cli': minor
---

`cogenta mcp --api-key <key>` — resolve the MCP server's actor from a real API
key, and a dedicated admin screen to mint one (L21 task 6).

Until now, `cogenta mcp` could only run as a real user (`--email`), a
synthetic test actor (`--role`), or anonymous — there was no way to generate
a credential for an MCP client from the admin, the way REST already lets you
via "Clés API". `--api-key` closes that gap by resolving through the exact
same `ApiKeyStore` (`@cogenta/auth`) and "roles = scope" mapping REST's own
`resolveActor` uses for a `cogenta_sk_…` bearer token — one store, two
callers, never a second lookup path. A role the key was not granted is
refused by the same `PermissionLayer` REST uses, exactly as it would be over
HTTP (R4). `@cogenta/core` gains `MCP_ACTOR_API_KEY_INVALID` for an unknown,
revoked or expired key.

The admin gains a new **MCP** screen (`@cogenta/admin`, private, no
changeset entry of its own), parallel to "Agents" rather than folded into
the generic "Clés API" screen — same underlying key store, different
audience: generating a key here also shows a ready-to-paste `cogenta mcp
--api-key …` command and a standard MCP client JSON configuration block,
both built from the raw key the server just returned, shown exactly once,
same as the existing screen's own raw-key handling.

See `packages/mcp/README.md` for the updated connection instructions.
