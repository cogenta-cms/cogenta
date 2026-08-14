---
'@cogenta/mcp': minor
---

Add the MCP (Model Context Protocol) server: `createMcpServer` exposes an
`ExecutableTool[]` manifest over a hand-rolled JSON-RPC 2.0 subset
(`initialize`, `tools/list`, `tools/call`) plus a stdio transport
(`serveMcpOverStdio`). The official `@modelcontextprotocol/sdk` was
audited and rejected: it pulls express, hono, ajv, jose and
cross-spawn (100+ transitive packages, 4.3MB) to expose three methods
this package now implements directly in ~200 lines (R9).
