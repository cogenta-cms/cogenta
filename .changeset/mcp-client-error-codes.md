---
'@cogenta/core': minor
'@cogenta/mcp': minor
---

Add the MCP client: `createMcpStdioClient` spawns a third-party MCP
server as a child process and speaks the same stdio JSON-RPC protocol
as the server side (task 17). `wrapMcpTool` turns a remote tool into an
ordinary `ToolDefinition` — permissions, `sideEffects`, `reversible` and
`cost` are declared by the integrator, never trusted from the remote
server, so a wrapped remote tool passes through the exact same registry,
manifest, audit and autonomy pipeline as an internal one.

Two new `@cogenta/core` error codes: `MCP_CLIENT_REMOTE_ERROR` (the
remote server answered with a JSON-RPC protocol error) and
`MCP_CLIENT_TOOL_FAILED` (the remote tool itself reported `isError:
true`).
