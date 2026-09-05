# @cogenta/mcp

## 0.2.0

### Minor Changes

- b8d307a: Fiche 58: the "MCP" admin screen renamed to "MCP Server" (nav/i18n only, no
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

### Patch Changes

- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [08e394b]
- Updated dependencies [d0a3250]
- Updated dependencies [0e88f30]
- Updated dependencies [750a10b]
- Updated dependencies [08e394b]
- Updated dependencies [edd0787]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [0ca8a79]
- Updated dependencies [c392e24]
- Updated dependencies [562c9c1]
- Updated dependencies [edf5623]
- Updated dependencies [db307e0]
- Updated dependencies [49815b9]
- Updated dependencies [122da7a]
- Updated dependencies [2fb2101]
- Updated dependencies [0e90b32]
- Updated dependencies [d0bfa1d]
- Updated dependencies [95acedf]
- Updated dependencies [6e5df34]
- Updated dependencies [bebbab8]
- Updated dependencies [a8199ea]
- Updated dependencies [16f63f6]
- Updated dependencies [1dd9e6f]
- Updated dependencies [656163e]
- Updated dependencies [4513a71]
- Updated dependencies [bdcb563]
- Updated dependencies [3cbd6d7]
- Updated dependencies [249eb6f]
- Updated dependencies [4d3f3c7]
- Updated dependencies [cb62917]
- Updated dependencies [5e43b20]
- Updated dependencies [b8d307a]
- Updated dependencies [54409f3]
- Updated dependencies [2285720]
- Updated dependencies [9b1dae8]
- Updated dependencies [8a8d873]
- Updated dependencies [3075941]
- Updated dependencies [e01efae]
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [745ebd8]
- Updated dependencies [960757d]
- Updated dependencies [835d736]
- Updated dependencies [cf005d4]
- Updated dependencies [07c0f0a]
  - @cogenta/core@0.5.0
  - @cogenta/agents@0.3.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff)]:
  - @cogenta/core@0.4.0
  - @cogenta/agents@0.2.1

## 0.1.3

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`809baee`](https://github.com/cogenta-cms/cogenta/commit/809baee0b47e48aea06235a97c0da29c7ba4b06c), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06), [`a332e41`](https://github.com/cogenta-cms/cogenta/commit/a332e416bfe08a226756451624b6344e7c6b7516), [`1f1e8b2`](https://github.com/cogenta-cms/cogenta/commit/1f1e8b24385750995bb2af90a8d94478d44bdcdc), [`ade7b38`](https://github.com/cogenta-cms/cogenta/commit/ade7b3807fd273e56bcbe7499eb83374a592d35f)]:
  - @cogenta/core@0.3.0
  - @cogenta/agents@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/agents@0.1.2

## 0.1.0

### Minor Changes

- [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the MCP client: `createMcpStdioClient` spawns a third-party MCP
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

- [`3226233`](https://github.com/cogenta-cms/cogenta/commit/3226233c7e4a301d8b0128ba87b5f90eb3e468c9) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the MCP (Model Context Protocol) server: `createMcpServer` exposes an
  `ExecutableTool[]` manifest over a hand-rolled JSON-RPC 2.0 subset
  (`initialize`, `tools/list`, `tools/call`) plus a stdio transport
  (`serveMcpOverStdio`). The official `@modelcontextprotocol/sdk` was
  audited and rejected: it pulls express, hono, ajv, jose and
  cross-spawn (100+ transitive packages, 4.3MB) to expose three methods
  this package now implements directly in ~200 lines (R9).

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`bcf646e`](https://github.com/cogenta-cms/cogenta/commit/bcf646edfd9810a977161075e639bce760b91864), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/agents@0.1.0
