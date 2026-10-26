---
"@cogenta/mcp": patch
"@cogenta/cli": patch
"@cogenta/api": patch
"@cogenta/core": patch
"@cogenta/agents": patch
---

Drive a deployed site over MCP, and stop one MCP client from taking the site down.

- `cogenta serve` answers MCP over Streamable HTTP at `/api/mcp` (POST, JSON or a short SSE stream for a `tools/call`), authenticated by an API key only (`Authorization: Bearer cogenta_sk_…`), checked on every request; the same tools, gates and audit as `cogenta mcp`. Turn it off with `mcp.http: false` or `COGENTA_MCP_HTTP=false` (an unreadable value is refused, never read as "on"). Batches are refused over HTTP; one caller may have at most five writes waiting for approval.
- `cogenta mcp` and `/api/mcp` expose `content.collections`, `content.schema`, `content.list`, `content.search` (new, `content.read`) and `media.list`; page-builder zones are written as blocks validated against the block registry (or refused with the reason); invalid writes are refused before an approval is asked; writes are recorded as `provenance: generated`/`assisted`; a revoked key or disabled account stops an open session at its next message; a cancelled or abandoned call withdraws its approval request. `ping` is answered, notifications never are, an unknown tool is `-32602`, and internal error details stay in the server log.
- `cogenta mcp` reads the key from `COGENTA_MCP_API_KEY` and says plainly when it is run outside a site folder.
- `@cogenta/mcp`'s stdio client no longer crashes the host when the spawned server exits at once (unhandled `EPIPE`).
- `/api/api-keys`: a scope must name roles the site has (`GET /api/api-keys/roles`), and an API key can no longer create, edit, rotate, recover, revoke or purge keys — a person signed in as admin must.
