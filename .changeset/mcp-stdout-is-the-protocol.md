---
'@cogenta/cli': patch
---

Stop `cogenta mcp` from writing a human banner onto the JSON-RPC channel.

The command printed "MCP server ready — N tool(s), actor: …" through `out`,
which the CLI builds on stdout — the stream the MCP protocol speaks on. The
first thing any client read was therefore not JSON, and the connection failed
before `initialize` was ever answered. No MCP client could connect, whatever
the client.

The line now goes to stderr, where anything this command says to a human
belongs. `McpOptions.out` stays, so every command keeps one signature, and
says in its own doc comment that this command must never write to it.

Every existing test in the file passed `createOutput(() => undefined)`,
discarding that channel, so none of them could see it. The new test wires
`out` to the same stream as the protocol, exactly as `src/index.ts` does, and
asserts every line on it parses as JSON.
