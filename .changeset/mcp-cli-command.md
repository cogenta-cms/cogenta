---
'@cogenta/core': minor
'@cogenta/cli': minor
---

`cogenta mcp` — a real MCP (Model Context Protocol) server, wired in (L20 audit).

`@cogenta/mcp`'s server/transport existed, tested and unused since it shipped:
no CLI command ever invoked it. `cogenta mcp` starts it for real, on the
process's own stdin/stdout, built from this site's actual tool manifest
(`buildManifest`, `@cogenta/agents`) — the same shape `cogenta serve` builds
for REST/GraphQL, not a second implementation.

**R4 applied for real**: `--email <email>` resolves the acting user from the
site's own user store and runs every tool call with that user's real roles,
checked by the same `PermissionLayer` REST and GraphQL use. `--role
<role,role>` hands a synthetic actor for local testing. With neither, calls
run as the anonymous `public` actor — content tools stay on the manifest and
stay permission-checked (a public actor sees only what a public actor may
see); media, site-config and HTTP-fetch tools, which have no permission
check of their own, are left off the manifest entirely rather than exposed
by default.

`@cogenta/core` gains three error codes: `MCP_ACTOR_OPTIONS_CONFLICT`,
`MCP_ACTOR_USER_NOT_FOUND`, `MCP_ACTOR_ROLE_EMPTY`.

See `packages/mcp/README.md` for how to connect Claude Desktop, Claude Code
or Cursor, and `BLOCKERS.md` §18 for the one known limitation: content
written through this path is not (yet) re-indexed for search/vectors or
redirect-tracked the way `cogenta serve`'s own write path is.
