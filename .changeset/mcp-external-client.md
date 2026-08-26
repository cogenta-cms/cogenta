---
"@cogenta/mcp": minor
"@cogenta/core": minor
"@cogenta/api": minor
"@cogenta/cli": minor
---

Fiche 58: the "MCP" admin screen renamed to "MCP Server" (nav/i18n only, no
functional change — task 1), and a real MCP **client**: this site's own agents can
now consume external MCP servers, gated by a security review (`security-reviewer`,
2026-08-26 — NO-GO as originally written, GO conditional on a sandboxing floor,
re-reviewed against this final implementation before merge).

**`@cogenta/mcp`**: `createMcpStdioClient` no longer inherits `process.env` —
`spawn` receives exactly `options.env ?? {}`, never the host's real environment
(the critical finding: the previous default handed a spawned third-party process
every secret this server had, `COGENTA_AUTH_SIGNING_KEY` included, before
`initialize()` was ever called). `stdio` is always `['pipe', 'pipe', 'pipe']`,
never `inherit` — stderr is captured and logged through the structured logger,
capped in size. Every JSON-RPC call has a hard timeout that kills the process and
rejects every pending call on the connection; `wrapMcpTool`'s `execute` now honours
`ctx.signal` too, so a run's own cancellation reaches the remote process the same
way. A best-effort memory/CPU watchdog polls the spawned PID (`ps`/PowerShell, no
native dependency — R9/R10); the real limit is host-level (cgroup, Job Object),
documented as a prerequisite, not a guarantee.

New `packages/mcp/src/registry/`: `McpConnectionStore` (table `mcp_connections`,
secret encrypted at rest with the same AES-256-GCM/`COGENTA_AUTH_SIGNING_KEY`
scheme as `@cogenta/agents`' `ProviderConfigStore` — R7), `discoverMcpConnection`
(a real `initialize()` + `tools/list()` probe through the sandboxed client),
`buildMcpToolDefinitions` (wires every enabled connection's checked tools into
Contract C `ToolDefinition`s). `McpConnectionStore.create()` structurally refuses a
`stdio` connection without `confirmUnsandboxed: true` — the mandatory, honest
acknowledgement that this binary runs with the Cogenta process's own full OS
privileges, unsandboxed beyond this package's floor; a UI can show the warning, but
the refusal itself lives here. `setExposedTools()` refuses a remote tool name never
actually seen in the connection's last discovered list — "absent, pas refusée": a
tool the admin never checked is never wrapped for any agent. `http` is a stored
transport (forward-compatible schema) with no working client yet — honestly
refused (`discoverMcpConnection`), never silently pretended to work.

**Contract C → `tools@1.4`** (`docs/04-contrats.md`): the parameterised permission
`mcp.external:<connectionId>.<remoteToolName>` — one permission per checked remote
tool, never per connection (`mcp.external.<connexion>` was rejected by the security
review: it would grant every checked tool on a connection indifferently of its own
risk, contradicting the "case à cocher par outil" principle and weakening R4). No
existing tool signature changes — additive to an open taxonomy, the same kind of
change `document.extract`/`logs.read`/`redirects.write`/`code.patch` already were.

**`@cogenta/core`**: ten new error codes — `MCP_CLIENT_CALL_TIMEOUT`,
`MCP_CLIENT_CALL_ABORTED`, `MCP_CLIENT_PROCESS_EXITED`, `MCP_CLIENT_SPAWN_FAILED`,
`MCP_CLIENT_CLOSED`, `MCP_CLIENT_RESOURCE_EXCEEDED`, `MCP_CONNECTION_NOT_FOUND`,
`MCP_CONNECTION_INVALID`, `MCP_CONNECTION_AUTH_INVALID`,
`MCP_CONNECTION_CONFIRMATION_REQUIRED`, `MCP_CONNECTION_TOOL_NOT_DISCOVERED`.

**`@cogenta/api`**: new `createMcpConnectionsRouter` (`/api/mcp-connections`,
admin-only) — list/create/enable-disable/remove, `POST .../test` (a real discovery
probe), `PUT .../exposed-tools` (the admin's checkbox decision). A new direct
dependency on `@cogenta/mcp` (internal workspace package, not a third-party
addition) for `discoverMcpConnection` and the store's types.

**`@cogenta/cli`**: `cogenta serve` creates the connection table and store
unconditionally (usable even without an LLM provider configured, same posture as
`/api/api-keys`); `packages/cli/src/commands/agent-runtime.ts`'s `buildAgentRuntime`
merges every enabled connection's checked tools into the site's real tool registry
through a live-swappable wrapper (`createLiveToolRegistry`) — a connection
created/tested/exposed from the admin screen becomes callable by an agent on its
very next lookup, no `cogenta serve` restart, the same "no restart needed"
guarantee `/api/providers` already gives. `AgentRuntimeAssembly` gains
`refreshMcpTools()` and `mcpDispose()` (closes every spawned `McpClient` and
removes every sandbox working directory on server shutdown). The fiche names
`packages/agents/src/runtime/` for this wiring; it lives in `@cogenta/mcp`/
`@cogenta/cli` instead — `@cogenta/mcp` already depends on `@cogenta/agents`, so
the reverse dependency the fiche's own path would need is a package cycle. Deviation
signalled, not silently worked around.

Tests: `@cogenta/mcp` — the sandboxing floor (no inherited environment variable
proven by inspecting what `spawn` actually receives while a real host secret is
set; a hung server killed and rejected under a configured timeout; per-call abort;
stderr capture), the connection store (confirmation requirement, encrypted secret,
"absent, pas refusée"), discovery, and `buildMcpToolDefinitions` (one client shared
across a connection's tools, a failed connection skipped not thrown, an end-to-end
call through a fake stdio server). `@cogenta/api` — admin-only, the confirmation
refusal, "absent, pas refusée" at the REST boundary. `@cogenta/cli` — a real,
spawned `node` process (`test/fixtures/fake-mcp-server.mjs`) driven end to end
through a real `cogenta serve`/SQLite/HTTP stack: connection created, tested,
exposed, called by a real agent run with a scripted LLM vendor, proving the actual
child process received none of the host's real environment
(`COGENTA_AUTH_SIGNING_KEY` included) and that disabling a connection removes its
tool from what an agent can call without a restart.
